const mysql = require("mysql2");
const AoiError = require("aoi.js/src/classes/AoiError");
const Interpreter = require("aoi.js/src/core/interpreter.js");
const EventEmitter = require("events");
const fs = require("fs");
const path = require("path");

class Database extends EventEmitter {
  constructor(client, options) {
    super();
    this.client = client;
    this.options = options;
    this.debug = this.options.debug ?? false;

    this.detectAndAlterFunctions();

    this.connect().then(async () => {
    }).catch(err => {
      AoiError.createConsoleMessage(
        [
          { text: `Failed to connect to MariaDB`, textColor: "red" },
          { text: `${err.message}`, textColor: "white" },
        ],
        "white",
        { text: " aoi.mysql  ", textColor: "cyan" }
      );
      process.exit(1);
    });
  }

  async connect() {
    try {
      this.client.db = mysql.createPool({
        host: this.options.host,
        user: this.options.user,
        password: this.options.password,
        database: this.options.database,
        port: this.options.port || 3306,
        connectionLimit: 10,
      });

      if (!this.options.tables || this.options?.tables.length === 0) {
        throw new TypeError("Missing variable tables, please provide at least one table.");
      }

      if (this.options.tables.includes("__aoijs_vars__")) {
        throw new TypeError("'__aoijs_vars__' is reserved as a table name.");
      }

      this.client.db.tables = [...this.options.tables, "__aoijs_vars__"];

      this.client.db.get = this.get.bind(this);
      this.client.db.set = this.set.bind(this);
      this.client.db.drop = this.drop.bind(this);
      this.client.db.delete = this.delete.bind(this);
      this.client.db.deleteMany = this.deleteMany.bind(this);
      this.client.db.findOne = this.findOne.bind(this);
      this.client.db.findMany = this.findMany.bind(this);
      this.client.db.all = this.all.bind(this);
      this.client.db.db = {}; 
      this.client.db.db.transfer = this.transfer.bind(this);
      this.client.db.db.avgPing = this.ping.bind(this);

      this.client.db.db.readyAt = Date.now();

      await this.ping();

      const pingResult = await this.ping();

      if (pingResult instanceof Error) {
        throw new Error(`(${pingResult.code}) ${pingResult.message}`);
      }

      if (this.options.logging !== false) {
        const { version } = require("../package.json");
        AoiError.createConsoleMessage(
          [
            { text: `Successfully connected to MariaDB`, textColor: "white" },
            { text: `Server Latency: ${pingResult}ms`, textColor: "white" },
            { text: `Installed on v${version}`, textColor: "green" },
          ],
          "white",
          { text: " aoi.mysql  ", textColor: "cyan" }
        );
      }

      for (const table of this.client.db.tables) {
        await this.checkAndCreateTable(table);
      }

      this.emit("ready", { client: this.client });

    } catch (err) {
      throw new Error(`${err.message}`);
    }

    if (this.options.convertOldData.enabled === true) {
      await this.transfer();
    }
  }

  async ping() {
    let start = Date.now();
    try {
      await this.client.db.promise().query("SELECT 1");
      return Date.now() - start;
    } catch (err) {
      return err;
    }
  }

  async get(table, key, id = undefined) {
    let keyValue = id ? `${key}_${id}` : key;

    if (typeof keyValue !== 'string') {
      return null;
    }

    try {
      const [rows] = await this.client.db.promise().query(
        `SELECT value FROM ${table} WHERE \`key\` = ?`,
        [keyValue]
      );
      
      let data = rows.length > 0 ? rows[0].value : null;

      const aoijs_vars = ["cooldown", "setTimeout", "ticketChannel"];
      if (aoijs_vars.includes(key)) {
        data = rows.length > 0 ? rows[0].value : null;
      } else {
        if (!this.client.variableManager.has(key, table)) return null;
        const __var = this.client.variableManager.get(key, table)?.default;
        data = data || __var;
      }

      return data;
    } catch (err) {
      return null;
    }
  }

  async set(table, key, id, value) {
    let keyValue = id ? `${key}_${id}` : key;
  
    if (typeof keyValue !== 'string') {
      console.warn(`[aoi.mysql] Invalid keyValue type: Expected string, got ${typeof keyValue}`);
      return;
    }
  
    if (typeof value !== 'string' && typeof value !== 'number') {
      console.warn(`[aoi.mysql] Invalid value type: Expected string or number, got ${typeof value}`);
      return;
    }
  
    try {
      await this.client.db.promise().query(
        `INSERT INTO ${table} (\`key\`, \`value\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`value\` = ?`,
        [keyValue, value, value]
      );
    } catch (err) {
      console.error('Error executing query:', err);
      return;
    }
  }  

  async drop(table, variable) {
    try {
      if (variable) {
        await this.client.db.promise().query(`DROP TABLE IF EXISTS ${variable}`);
      } else {
        await this.client.db.promise().query(`DROP DATABASE IF EXISTS ${table}`);
      }
    } catch (err) {
      return;
    }
  }

  async findOne(table, query) {
    try {
      const [rows] = await this.client.db.promise().query(`SELECT * FROM ${table} WHERE \`key\` = ?`, [query]);
      return rows[0] || null;
    } catch (err) {
      return null;
    }
  }

  async deleteMany(table, query) {
    try {
      await this.client.db.promise().query(`DELETE FROM ${table} WHERE \`key\` LIKE ?`, [`${query}%`]);
    } catch (err) {
      return;
    }
  }

  async delete(table, key, id) {
    let keyValue = id ? `${key}_${id}` : key;

    try {
      await this.client.db.promise().query(`DELETE FROM ${table} WHERE \`key\` = ?`, [keyValue]);
    } catch (err) {
      return;
    }
  }

  async findMany(table, query, limit) {
    try {
      const [rows] = await this.client.db.promise().query(`SELECT * FROM ${table} WHERE \`key\` LIKE ? LIMIT ?`, [query, limit]);
      return rows;
    } catch (err) {
      return [];
    }
  }

  async all(table, filter, list = 100, sort = "asc") {
    try {
      const [rows] = await this.client.db.promise().query(`SELECT * FROM ${table} WHERE \`key\` LIKE ? LIMIT ?`, [filter, list]);
      rows.sort((a, b) => (sort === "asc" ? a.value - b.value : b.value - a.value));
      return rows;
    } catch (err) {
      return [];
    }
  }

  async transfer() {
    const backupFilePath = path.join(__dirname, "Conversion.js");

    if (fs.existsSync(backupFilePath)) {
      try {
        const backup = require(backupFilePath);
        backup(this.client, this.options);
      } catch (error) {
        return;
      }
    }
  }

  async checkAndCreateTable(table) {
    try {
      const [rows] = await this.client.db.promise().query(`SHOW TABLES LIKE ?`, [table]);

      if (rows.length === 0) {
        await this.client.db.promise().query(`CREATE TABLE IF NOT EXISTS ${table} (\`key\` VARCHAR(255) PRIMARY KEY, \`value\` TEXT)`);
      }
    } catch (err) {
      return;
    }
  }

  async detectAndAlterFunctions() {
    const dir = path.join('.', "node_modules", "aoi.js", "src", "functions");

    const filesvar = fs.readdirSync(dir).filter(file => file.endsWith("Var.js"));
    const filescooldown = fs.readdirSync(dir).filter(file => file.startsWith("cooldown") || file.endsWith("Cooldown.js"));
    let altered = false;

    for (const file of filesvar) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");

      if (content.includes("?.value ??")) {
        altered = true;
        const updatedContent = content.replace("?.value ??", "??");
        fs.writeFileSync(filePath, updatedContent, "utf8");
      }
    }

    for (const file of filescooldown) {
      const filePath = path.join(dir, file);
      const content = fs.readFileSync(filePath, "utf8");

      if (content.includes("cooldown?.value")) {
        altered = true;
        const updatedContent = content.replace("cooldown?.value", "cooldown");
        fs.writeFileSync(filePath, updatedContent, "utf8");
      }
    }

    if (altered) {
      AoiError.createConsoleMessage(
        [
          { text: `Restarting to apply changes...`, textColor: "red" },
        ],
        "white",
        { text: " aoi.mysql  ", textColor: "cyan" }
      );
      process.exit(1);
    }
  }
}

module.exports = { Database };
