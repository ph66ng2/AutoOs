import { useEffect, useState, useCallback } from "react";
import { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import { AppSchema, type POCItem, type POCLog } from "./schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { appDataDir } from "@tauri-apps/api/path";

/**
 * PowerSync POC Page — isolated validation spike.
 *
 * NOT routed in production. Import manually to test:
 *   import { PowerSyncPOC } from "@/poc/PowerSyncPOC";
 *
 * Validates:
 * 1. Local SQLite write via PowerSync (offline)
 * 2. Sync status tracking (connected / disconnected / syncing)
 * 3. Supabase connector structure for upload
 */
export default function PowerSyncPOC() {
  const [db, setDb] = useState<PowerSyncTauriDatabase | null>(null);
  const [items, setItems] = useState<POCItem[]>([]);
  const [logs, setLogs] = useState<POCLog[]>([]);
  const [status, setStatus] = useState<string>("Initializing...");
  const [connected, setConnected] = useState(false);
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [supabaseKey, setSupabaseKey] = useState("");
  const [itemName, setItemName] = useState("");
  const [logMessage, setLogMessage] = useState("");

  // Initialize PowerSync database
  useEffect(() => {
    let database: PowerSyncTauriDatabase | null = null;
    let cancelled = false;

    async function init() {
      try {
        const dataDir = await appDataDir();
        database = new PowerSyncTauriDatabase({
          schema: AppSchema,
          database: {
            dbFilename: "powersync-poc.db",
            dbLocationAsync: async () => dataDir,
          },
        });

        await database._initialize();
        if (cancelled) return;

        setDb(database);
        setStatus("Ready (disconnected)");

        // Watch sync status
        database.registerListener({
          statusChanged: (syncStatus) => {
            const msg = syncStatus.getMessage();
            setStatus(msg);
            setConnected(syncStatus.connected);
          },
        });

        // Initial load
        await reloadData(database);
      } catch (err) {
        console.error("PowerSync init failed:", err);
        setStatus(`Init error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (database) {
        database.close().catch(console.error);
      }
    };
  }, []);

  const reloadData = useCallback(async (database: PowerSyncTauriDatabase) => {
    const itemResult = await database.getAll<POCItem>("SELECT * FROM poc_items ORDER BY created_at DESC");
    const logResult = await database.getAll<POCLog>("SELECT * FROM poc_logs ORDER BY created_at DESC");
    setItems(itemResult);
    setLogs(logResult);
  }, []);

  const handleCreateItem = async () => {
    if (!db || !itemName.trim()) return;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute("INSERT INTO poc_items (id, name, created_at) VALUES (?, ?, ?)", [
      id,
      itemName.trim(),
      now,
    ]);
    setItemName("");
    await reloadData(db);
    await db.execute("INSERT INTO poc_logs (id, message, created_at) VALUES (?, ?, ?)", [
      crypto.randomUUID(),
      `Created item: ${itemName.trim()}`,
      now,
    ]);
    await reloadData(db);
  };

  const handleCreateLog = async () => {
    if (!db || !logMessage.trim()) return;
    await db.execute("INSERT INTO poc_logs (id, message, created_at) VALUES (?, ?, ?)", [
      crypto.randomUUID(),
      logMessage.trim(),
      new Date().toISOString(),
    ]);
    setLogMessage("");
    await reloadData(db);
  };

  const handleConnect = async () => {
    if (!db) return;
    if (!supabaseUrl || !supabaseKey) {
      setStatus("Error: enter Supabase URL and key");
      return;
    }
    try {
      setStatus("Connecting...");
      await db.connect();
    } catch (err) {
      setStatus(`Connect error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleDisconnect = async () => {
    if (!db) return;
    await db.disconnect();
    setConnected(false);
    setStatus("Disconnected");
  };

  const statusColor = connected ? "bg-green-500" : status.includes("Error") ? "bg-red-500" : "bg-yellow-500";

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PowerSync POC</h1>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${statusColor}`} />
          <Badge variant="outline">{status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supabase Credentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Supabase URL (https://...supabase.co)"
            value={supabaseUrl}
            onChange={(e) => setSupabaseUrl(e.target.value)}
          />
          <Input
            placeholder="Supabase service_role key"
            type="password"
            value={supabaseKey}
            onChange={(e) => setSupabaseKey(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={handleConnect} disabled={connected}>
              Go Online
            </Button>
            <Button variant="outline" onClick={handleDisconnect} disabled={!connected}>
              Go Offline
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Item (Local SQLite)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Item name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateItem()}
            />
            <Button onClick={handleCreateItem}>Create</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create Log (Local SQLite)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Log message"
              value={logMessage}
              onChange={(e) => setLogMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateLog()}
            />
            <Button onClick={handleCreateLog}>Log</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Local Items ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between border-b py-1">
                  <span>{item.name}</span>
                  <span className="text-muted-foreground">{item.created_at}</span>
                </li>
              ))}
              {items.length === 0 && (
                <li className="text-muted-foreground italic">No items yet</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local Logs ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex justify-between border-b py-1">
                  <span>{log.message}</span>
                  <span className="text-muted-foreground">{log.created_at}</span>
                </li>
              ))}
              {logs.length === 0 && (
                <li className="text-muted-foreground italic">No logs yet</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
