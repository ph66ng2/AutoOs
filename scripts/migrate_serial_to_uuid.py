#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
migrate_serial_to_uuid.py

Big-Bang Migration Script: PostgreSQL SERIAL INTEGER PKs → Supabase UUID PKs.

Reads a pg_dump SQL file (data-only, INSERT statements with INTEGER PKs) and
outputs transformed SQL ready for import into a Supabase schema where:
  • All PKs are uuid (gen_random_uuid) except configuracoes_sistema (fixed UUID)
  • Every table has empresa_id uuid NOT NULL
  • FKs reference uuid columns

Usage:
    python3 migrate_serial_to_uuid.py \
        --input dump.sql \
        --output transformed.sql \
        [--empresa-uuid 00000000-0000-0000-0000-000000000001] \
        [--config-uuid  00000000-0000-0000-0000-000000000002]

Output SQL structure:
  1. Migration map tables (migration_map_<table>) with old_id → new_uuid
  2. Transformed INSERTs in dependency order:
     Phase 1 (root): clientes, produtos, equipamentos, security_profiles,
                     gastos_fixos, servicos_catalogo
     Phase 2 (leaf): movimentacoes_estoque, verificacoes, comunicacoes,
                      equipamento_imagens, security_audit_log, gastos_variaveis
     Special:        configuracoes_sistema
"""

import argparse
import re
import sys
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# ═══════════════════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_EMPRESA_UUID = "00000000-0000-0000-0000-000000000001"
DEFAULT_CONFIG_UUID = "00000000-0000-0000-0000-000000000002"

# Tables that get gen_random_uuid() (12 tables)
UUID_TABLES = [
    "clientes",
    "produtos",
    "equipamentos",
    "security_profiles",
    "gastos_fixos",
    "servicos_catalogo",
    "movimentacoes_estoque",
    "verificacoes",
    "comunicacoes",
    "equipamento_imagens",
    "security_audit_log",
    "gastos_variaveis",
]

# Phase 1: root tables (no FK dependencies on other migrated tables)
ROOT_TABLES = [
    "clientes",
    "produtos",
    "equipamentos",
    "security_profiles",
    "gastos_fixos",
    "servicos_catalogo",
]

# Phase 2: leaf tables (have FKs to root tables)
LEAF_TABLES = [
    "movimentacoes_estoque",
    "verificacoes",
    "comunicacoes",
    "equipamento_imagens",
    "security_audit_log",
    "gastos_variaveis",
]

# All tables that appear in the dump (13 total)
ALL_TABLES = UUID_TABLES + ["configuracoes_sistema"]

# FK mappings: table -> {fk_column: parent_table}
FK_MAP: Dict[str, Dict[str, str]] = {
    "equipamentos": {"cliente_id": "clientes"},
    "movimentacoes_estoque": {"produto_id": "produtos"},
    "verificacoes": {
        "equipamento_id": "equipamentos",
        "adjusted_by_profile_id": "security_profiles",
    },
    "comunicacoes": {"equipamento_id": "equipamentos"},
    "security_audit_log": {"profile_id": "security_profiles"},
    "equipamento_imagens": {"equipamento_id": "equipamentos"},
    "gastos_variaveis": {"referencia_id": "gastos_fixos"},
}

# PK column name for each table
PK_COLUMN = {t: "id" for t in ALL_TABLES}

# Columns that exist in source but NOT in target (must be excluded from INSERTs)
SOURCE_ONLY_COLUMNS: Dict[str, List[str]] = {
    "equipamento_imagens": ["bytes"],
}

# Columns that exist in target but NOT in source (must be added to INSERTs)
TARGET_EXTRA_COLUMNS: Dict[str, List[str]] = {
    "equipamento_imagens": [],  # empresa_id is handled globally
}

# Special default values for columns that may be NULL in source but NOT NULL in target
NULLABLE_TO_NOT_NULL_DEFAULTS: Dict[str, Dict[str, str]] = {
    "equipamento_imagens": {
        "storage_path": "''",
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# SQL Parsing Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def split_values_tuple(values_str: str) -> List[str]:
    """
    Split the content inside a VALUES tuple parentheses into individual value tokens.

    Handles:
      - Single-quoted strings with escaped quotes ('')
      - Double-quoted identifiers (rare in VALUES but possible)
      - Nested parentheses (ARRAY[...], row constructors)
      - NULL, true, false, numbers
    """
    values = []
    current = []
    in_string = False
    string_char = None
    paren_depth = 0
    i = 0
    n = len(values_str)

    while i < n:
        char = values_str[i]

        if in_string:
            current.append(char)
            if char == string_char:
                # Check for escaped quote (SQL uses doubled quote char)
                if i + 1 < n and values_str[i + 1] == string_char:
                    current.append(values_str[i + 1])
                    i += 2
                    continue
                else:
                    in_string = False
                    string_char = None
        elif char in ("'", '"'):
            in_string = True
            string_char = char
            current.append(char)
        elif char == '(':
            paren_depth += 1
            current.append(char)
        elif char == ')':
            paren_depth -= 1
            current.append(char)
        elif char == ',' and paren_depth == 0 and not in_string:
            values.append("".join(current).strip())
            current = []
        else:
            current.append(char)
        i += 1

    if current:
        values.append("".join(current).strip())

    return values


def parse_insert_statement(sql: str) -> Optional[Tuple[str, List[str], List[List[str]]]]:
    """
    Parse an INSERT statement into (table_name, columns, rows).

    Supports:
      INSERT INTO table (col1, col2) VALUES (v1, v2), (v3, v4);
      INSERT INTO table VALUES (v1, v2);   (no column list — we infer from schema knowledge)

    Returns None if the statement doesn't match expected patterns.
    """
    # Normalize whitespace
    sql = sql.strip()
    if not sql.upper().startswith("INSERT INTO"):
        return None

    # Pattern with explicit column list
    pattern_with_cols = re.compile(
        r"INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s+(.+);?\s*$",
        re.IGNORECASE | re.DOTALL,
    )
    m = pattern_with_cols.match(sql)
    if m:
        table_name = m.group(1).lower()
        cols_raw = m.group(2)
        values_raw = m.group(3).strip()

        columns = [c.strip().lower() for c in cols_raw.split(",")]

        # Extract individual row tuples: ( ... )
        rows = []
        # Use a simple approach: find top-level parentheses groups
        row_strings = extract_top_level_parens(values_raw)
        for row_str in row_strings:
            inner = row_str[1:-1] if row_str.startswith("(") and row_str.endswith(")") else row_str
            row_values = split_values_tuple(inner)
            rows.append(row_values)

        return table_name, columns, rows

    # Pattern without column list (rare in pg_dump --inserts, but handle it)
    pattern_no_cols = re.compile(
        r"INSERT\s+INTO\s+(\w+)\s+VALUES\s+(.+);?\s*$",
        re.IGNORECASE | re.DOTALL,
    )
    m = pattern_no_cols.match(sql)
    if m:
        table_name = m.group(1).lower()
        values_raw = m.group(2).strip()

        # We don't know columns — return empty columns list
        # The caller will need to handle this (we'll skip or use schema knowledge)
        rows = []
        row_strings = extract_top_level_parens(values_raw)
        for row_str in row_strings:
            inner = row_str[1:-1] if row_str.startswith("(") and row_str.endswith(")") else row_str
            row_values = split_values_tuple(inner)
            rows.append(row_values)

        return table_name, [], rows

    return None


def extract_top_level_parens(text: str) -> List[str]:
    """Extract top-level parenthesized groups from text."""
    groups = []
    current = []
    depth = 0
    in_string = False
    string_char = None
    i = 0
    n = len(text)

    while i < n:
        char = text[i]
        if in_string:
            current.append(char)
            if char == string_char:
                if i + 1 < n and text[i + 1] == string_char:
                    current.append(text[i + 1])
                    i += 2
                    continue
                else:
                    in_string = False
                    string_char = None
        elif char in ("'", '"'):
            in_string = True
            string_char = char
            current.append(char)
        elif char == '(':
            if depth == 0:
                current = ['(']
            else:
                current.append(char)
            depth += 1
        elif char == ')':
            depth -= 1
            current.append(char)
            if depth == 0:
                groups.append("".join(current).strip())
                current = []
        elif depth > 0:
            current.append(char)
        i += 1

    return groups


# ═══════════════════════════════════════════════════════════════════════════════
# Migration Logic
# ═══════════════════════════════════════════════════════════════════════════════


class MigrationTransformer:
    def __init__(self, empresa_uuid: str, config_uuid: str):
        self.empresa_uuid = empresa_uuid
        self.config_uuid = config_uuid

        # old_id (int) -> new_uuid (str) for each table
        self.id_maps: Dict[str, Dict[int, str]] = defaultdict(dict)

        # Parsed INSERT statements grouped by table
        # table_name -> list of (columns, rows)
        self.inserts: Dict[str, List[Tuple[List[str], List[List[str]]]]] = defaultdict(list)

        # Statistics
        self.stats: Dict[str, int] = defaultdict(int)

    def generate_uuid(self) -> str:
        """Generate a random UUID v4."""
        return str(uuid.uuid4())

    def build_maps(self, sql_lines: List[str]) -> None:
        """
        First pass: scan all INSERT statements and build id → uuid maps.
        """
        buffer = []
        for line in sql_lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("--"):
                continue

            buffer.append(line)
            if stripped.endswith(";"):
                sql = " ".join(buffer)
                buffer = []
                self._process_insert_for_maps(sql)

        if buffer:
            sql = " ".join(buffer)
            self._process_insert_for_maps(sql)

    def _process_insert_for_maps(self, sql: str) -> None:
        parsed = parse_insert_statement(sql)
        if not parsed:
            return

        table_name, columns, rows = parsed
        if table_name not in ALL_TABLES:
            return  # Skip non-migrated tables (e.g., _sqlx_migrations)

        self.inserts[table_name].append((columns, rows))

        # Find id column index
        if not columns:
            # Without column list, we can't reliably map — skip
            print(f"[WARN] INSERT without column list for {table_name} — skipping id mapping", file=sys.stderr)
            return

        if "id" not in columns:
            # Some tables might not have id in this INSERT (unlikely for pg_dump)
            return

        id_idx = columns.index("id")

        for row in rows:
            if id_idx >= len(row):
                continue
            id_val = row[id_idx].strip()
            if id_val.upper() == "NULL":
                continue
            try:
                old_id = int(id_val)
            except ValueError:
                continue

            if table_name == "configuracoes_sistema":
                # Fixed UUID for configuracoes_sistema
                new_uuid = self.config_uuid
            else:
                # Generate new random UUID
                new_uuid = self.generate_uuid()

            self.id_maps[table_name][old_id] = new_uuid

    def verify_fk_integrity(self) -> bool:
        """
        Verify that every FK value in leaf tables has a corresponding entry
        in the parent table's id map. Returns True if clean, False if orphans found.
        """
        orphans_found = False

        for table_name, fks in FK_MAP.items():
            for fk_col, parent_table in fks.items():
                parent_map = self.id_maps.get(parent_table, {})

                for columns, rows in self.inserts.get(table_name, []):
                    if fk_col not in columns:
                        continue
                    fk_idx = columns.index(fk_col)

                    for row in rows:
                        if fk_idx >= len(row):
                            continue
                        fk_val = row[fk_idx].strip()
                        if fk_val.upper() == "NULL":
                            continue
                        try:
                            fk_int = int(fk_val)
                        except ValueError:
                            continue

                        if fk_int not in parent_map:
                            print(
                                f"[ORPHAN FK] {table_name}.{fk_col} = {fk_int} "
                                f"references missing {parent_table}.id",
                                file=sys.stderr,
                            )
                            orphans_found = True

        return not orphans_found

    def generate_output(self) -> List[str]:
        """
        Generate the transformed SQL output.
        """
        output: List[str] = []

        # Header
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("-- Transformed SQL for Supabase UUID Migration")
        output.append("-- Generated by migrate_serial_to_uuid.py")
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("")
        output.append(f"-- Empresa UUID: {self.empresa_uuid}")
        output.append(f"-- Config UUID:  {self.config_uuid}")
        output.append("")

        # Section 1: Migration map tables
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("-- 1. Migration Map Tables (for verification & audit)")
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("")

        for table_name in UUID_TABLES:
            map_table = f"migration_map_{table_name}"
            output.append(f"CREATE TABLE IF NOT EXISTS {map_table} (")
            output.append(f"    old_id INTEGER PRIMARY KEY,")
            output.append(f"    new_uuid uuid NOT NULL UNIQUE")
            output.append(f");")
            output.append("")

            # Insert map rows
            id_map = self.id_maps.get(table_name, {})
            if id_map:
                rows_sql = ",\n".join(
                    f"    ({old_id}, '{new_uuid}'::uuid)"
                    for old_id, new_uuid in sorted(id_map.items())
                )
                output.append(f"INSERT INTO {map_table} (old_id, new_uuid) VALUES")
                output.append(rows_sql + ";")
                output.append("")

        # Section 2: Transformed INSERTs in dependency order
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("-- 2. Transformed INSERTs (UUID PKs + empresa_id)")
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("")

        # Phase 1: Root tables
        output.append("-- ─── Phase 1: Root Tables ────────────────────────────────────────────────────────")
        output.append("")
        for table_name in ROOT_TABLES:
            self._write_transformed_inserts(output, table_name)

        # Phase 2: Leaf tables
        output.append("")
        output.append("-- ─── Phase 2: Leaf Tables ──────────────────────────────────────────────────────")
        output.append("")
        for table_name in LEAF_TABLES:
            self._write_transformed_inserts(output, table_name)

        # Special: configuracoes_sistema
        output.append("")
        output.append("-- ─── Special: Configuracoes Sistema (fixed UUID) ───────────────────────────────")
        output.append("")
        self._write_transformed_inserts(output, "configuracoes_sistema")

        # Footer: verification query
        output.append("")
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("-- 3. Post-import verification query")
        output.append("-- ═══════════════════════════════════════════════════════════════════════════════")
        output.append("")
        output.append("-- Run this after import to verify row counts:")
        output.append("--")
        for table_name in ALL_TABLES:
            output.append(f"-- SELECT '{table_name}' AS table_name, COUNT(*) AS row_count FROM {table_name};")
        output.append("")

        return output

    def _write_transformed_inserts(self, output: List[str], table_name: str) -> None:
        """Write transformed INSERT statements for a single table."""
        inserts = self.inserts.get(table_name, [])
        if not inserts:
            output.append(f"-- No data for {table_name}")
            output.append("")
            return

        for columns, rows in inserts:
            if not columns:
                # Can't transform without column list
                output.append(f"-- Skipped INSERT without column list for {table_name}")
                continue

            # Build new column list
            new_columns = list(columns)

            for col_to_remove in SOURCE_ONLY_COLUMNS.get(table_name, []):
                if col_to_remove in new_columns:
                    new_columns.remove(col_to_remove)

            # Add empresa_id if not present
            if "empresa_id" not in new_columns:
                new_columns.append("empresa_id")

            # Find indices we need to remap
            id_idx = new_columns.index("id") if "id" in new_columns else -1
            fk_indices = {}
            if table_name in FK_MAP:
                for fk_col, parent_table in FK_MAP[table_name].items():
                    if fk_col in new_columns:
                        fk_indices[fk_col] = new_columns.index(fk_col)

            # Build transformed rows
            transformed_rows = []
            for row in rows:
                new_row = list(row)

                if "id" in columns:
                    old_id_idx = columns.index("id")
                    if old_id_idx < len(new_row):
                        old_id_val = new_row[old_id_idx].strip()
                        if old_id_val.upper() != "NULL":
                            try:
                                old_id_int = int(old_id_val)
                                if table_name == "configuracoes_sistema":
                                    new_row[old_id_idx] = f"'{self.config_uuid}'::uuid"
                                else:
                                    new_uuid = self.id_maps[table_name].get(old_id_int)
                                    if new_uuid:
                                        new_row[old_id_idx] = f"'{new_uuid}'::uuid"
                                    else:
                                        print(
                                            f"[WARN] Missing UUID map for {table_name}.id={old_id_int}",
                                            file=sys.stderr,
                                        )
                            except ValueError:
                                pass

                for fk_col, parent_table in FK_MAP.get(table_name, {}).items():
                    if fk_col in columns:
                        fk_idx_orig = columns.index(fk_col)
                        if fk_idx_orig < len(new_row):
                            fk_val = new_row[fk_idx_orig].strip()
                            if fk_val.upper() != "NULL":
                                try:
                                    fk_int = int(fk_val)
                                    parent_uuid = self.id_maps.get(parent_table, {}).get(fk_int)
                                    if parent_uuid:
                                        new_row[fk_idx_orig] = f"'{parent_uuid}'::uuid"
                                    else:
                                        print(
                                            f"[WARN] Missing FK map for {table_name}.{fk_col}={fk_int} -> {parent_table}",
                                            file=sys.stderr,
                                        )
                                        new_row[fk_idx_orig] = "NULL"
                                except ValueError:
                                    pass

                for col, default_val in NULLABLE_TO_NOT_NULL_DEFAULTS.get(table_name, {}).items():
                    if col in columns:
                        col_idx = columns.index(col)
                        if col_idx < len(new_row) and new_row[col_idx].strip().upper() == "NULL":
                            new_row[col_idx] = default_val

                for col_to_remove in SOURCE_ONLY_COLUMNS.get(table_name, []):
                    if col_to_remove in columns:
                        idx = columns.index(col_to_remove)
                        if idx < len(new_row):
                            new_row.pop(idx)

                # Add empresa_id value
                if "empresa_id" in new_columns:
                    new_row.append(f"'{self.empresa_uuid}'::uuid")

                # Ensure row length matches column count
                if len(new_row) != len(new_columns):
                    print(
                        f"[WARN] Column/values mismatch for {table_name}: "
                        f"{len(new_columns)} cols vs {len(new_row)} values",
                        file=sys.stderr,
                    )

                transformed_rows.append(new_row)

            if not transformed_rows:
                continue

            # Build the INSERT statement
            cols_sql = ", ".join(new_columns)
            rows_sql = ",\n".join(
                "(" + ", ".join(v for v in row) + ")"
                for row in transformed_rows
            )

            output.append(f"INSERT INTO {table_name} ({cols_sql}) VALUES")
            output.append(rows_sql + ";")
            output.append("")

            self.stats[f"{table_name}_rows"] += len(transformed_rows)

    def print_summary(self) -> None:
        """Print migration summary to stderr."""
        print("\n" + "=" * 60, file=sys.stderr)
        print("MIGRATION SUMMARY", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        for table_name in ALL_TABLES:
            map_count = len(self.id_maps.get(table_name, {}))
            row_count = self.stats.get(f"{table_name}_rows", 0)
            print(f"  {table_name:30s}  map={map_count:4d}  rows={row_count:4d}", file=sys.stderr)
        print("=" * 60, file=sys.stderr)


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Migrate PostgreSQL SERIAL INTEGER PKs to Supabase UUID PKs",
    )
    parser.add_argument("--input", "-i", required=True, help="Input pg_dump SQL file")
    parser.add_argument("--output", "-o", required=True, help="Output transformed SQL file")
    parser.add_argument(
        "--empresa-uuid",
        default=DEFAULT_EMPRESA_UUID,
        help=f"Empresa UUID (default: {DEFAULT_EMPRESA_UUID})",
    )
    parser.add_argument(
        "--config-uuid",
        default=DEFAULT_CONFIG_UUID,
        help=f"Configuracoes sistema UUID (default: {DEFAULT_CONFIG_UUID})",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}", file=sys.stderr)
        return 1

    # Read input
    print(f"Reading {input_path} ...", file=sys.stderr)
    with open(input_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Transform
    transformer = MigrationTransformer(
        empresa_uuid=args.empresa_uuid,
        config_uuid=args.config_uuid,
    )

    print("Building UUID maps (Phase 1 + Phase 2 + Special) ...", file=sys.stderr)
    transformer.build_maps(lines)

    print("Verifying FK integrity ...", file=sys.stderr)
    if not transformer.verify_fk_integrity():
        print("\nERROR: Orphan FKs detected. Migration aborted.", file=sys.stderr)
        print("Fix the source data before retrying.", file=sys.stderr)
        return 2

    print("FK integrity OK — 0 orphans.", file=sys.stderr)

    print("Generating transformed SQL ...", file=sys.stderr)
    output_lines = transformer.generate_output()

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))

    transformer.print_summary()
    print(f"\nOutput written to: {output_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
