import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const db = new Database("seven_dwarfs.db");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    troco_inicial REAL DEFAULT 0,
    sabores_fixos TEXT DEFAULT '[{"nome":"Pilsen","preco":10},{"nome":"IPA","preco":10},{"nome":"Black Jack","preco":10},{"nome":"Vinho","preco":10},{"nome":"Manga","preco":10},{"nome":"Morango","preco":10}]',
    sabores_sazonais TEXT DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    itens TEXT,
    total REAL,
    metodo_pagamento TEXT,
    troco REAL DEFAULT 0,
    status TEXT DEFAULT 'pago'
  );

  CREATE TABLE IF NOT EXISTS vips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE,
    total_acumulado REAL DEFAULT 0
  );
`);

// Insert default config if not exists
const configExists = db.prepare("SELECT id FROM config WHERE id = 1").get();
if (!configExists) {
  db.prepare("INSERT INTO config (id, troco_inicial) VALUES (1, 0)").run();
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // API Routes
  app.get("/api/config", (req, res) => {
    const config = db.prepare("SELECT * FROM config WHERE id = 1").get();
    res.json(config);
  });

  app.post("/api/config", (req, res) => {
    const { troco_inicial, sabores_fixos, sabores_sazonais } = req.body;
    db.prepare(`
      UPDATE config 
      SET troco_inicial = ?, sabores_fixos = ?, sabores_sazonais = ? 
      WHERE id = 1
    `).run(troco_inicial, JSON.stringify(sabores_fixos), JSON.stringify(sabores_sazonais));
    res.json({ success: true });
  });

  app.get("/api/vendas", (req, res) => {
    const vendas = db.prepare("SELECT * FROM vendas ORDER BY timestamp DESC").all();
    res.json(vendas);
  });

  app.post("/api/vendas", (req, res) => {
    const { itens, total, metodo_pagamento, troco, vip_nome } = req.body;
    
    const insertVenda = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO vendas (itens, total, metodo_pagamento, troco) 
        VALUES (?, ?, ?, ?)
      `).run(JSON.stringify(itens), total, metodo_pagamento, troco);

      if (metodo_pagamento === "VIP" && vip_nome) {
        db.prepare(`
          INSERT INTO vips (nome, total_acumulado) 
          VALUES (?, ?) 
          ON CONFLICT(nome) DO UPDATE SET total_acumulado = total_acumulado + ?
        `).run(vip_nome, total, total);
      }

      // Backup to CSV (simplified)
      const vendas = db.prepare("SELECT * FROM vendas").all();
      const csvContent = "id,timestamp,total,metodo_pagamento,status\n" + 
        vendas.map((v: any) => `${v.id},${v.timestamp},${v.total},${v.metodo_pagamento},${v.status}`).join("\n");
      fs.writeFileSync("vendas_backup.csv", csvContent);

      const vips = db.prepare("SELECT * FROM vips").all();
      const vipsCsvContent = "id,nome,total_acumulado\n" + 
        vips.map((v: any) => `${v.id},${v.nome},${v.total_acumulado}`).join("\n");
      fs.writeFileSync("vips_backup.csv", vipsCsvContent);

      return result.lastInsertRowid;
    });

    const vendaId = insertVenda();
    res.json({ success: true, vendaId });
  });

  app.post("/api/vendas/estorno", (req, res) => {
    const { id, item_index } = req.body;
    const venda = db.prepare("SELECT * FROM vendas WHERE id = ?").get() as any;
    
    if (!venda) return res.status(404).json({ error: "Venda não encontrada" });

    if (item_index !== undefined) {
      // Partial refund (simplified: just mark as estornado if last item or update total)
      // For simplicity, let's mark the whole sale as estornado if requested or just update total
      const itens = JSON.parse(venda.itens);
      const item = itens[item_index];
      itens.splice(item_index, 1);
      const newTotal = itens.reduce((acc: number, cur: any) => acc + cur.preco * cur.quantidade, 0);
      
      db.prepare("UPDATE vendas SET itens = ?, total = ? WHERE id = ?")
        .run(JSON.stringify(itens), newTotal, id);
    } else {
      db.prepare("UPDATE vendas SET status = 'estornado' WHERE id = ?").run(id);
    }

    res.json({ success: true });
  });

  app.get("/api/vips", (req, res) => {
    const vips = db.prepare("SELECT * FROM vips").all();
    res.json(vips);
  });

  app.post("/api/reset", (req, res) => {
    db.exec(`
      DELETE FROM vendas;
      DELETE FROM vips;
      UPDATE config SET troco_inicial = 0, sabores_fixos = '[{"nome":"Pilsen","preco":10},{"nome":"IPA","preco":10},{"nome":"Black Jack","preco":10},{"nome":"Vinho","preco":10},{"nome":"Manga","preco":10},{"nome":"Morango","preco":10}]', sabores_sazonais = '[]' WHERE id = 1;
    `);
    if (fs.existsSync("vendas_backup.csv")) fs.unlinkSync("vendas_backup.csv");
    if (fs.existsSync("vips_backup.csv")) fs.unlinkSync("vips_backup.csv");
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
