import { Schema, Table, column } from "@powersync/web";

export const AppSchema = new Schema([
  new Table({
    name: column.text,
    created_at: column.text,
  }).copyWithName("poc_items"),
  new Table({
    message: column.text,
    created_at: column.text,
  }).copyWithName("poc_logs"),
]);

export interface POCItem {
  id: string;
  name: string;
  created_at: string;
}

export interface POCLog {
  id: string;
  message: string;
  created_at: string;
}
