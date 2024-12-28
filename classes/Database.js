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
      if(this.options.url.length === 0){

        this.client.db = mysql.createPool({
          host: this.options.host,
          user: this.options.user,
          password: this.options.password,
          database: this.options.database,
          port: this.options.port || 3306,
          connectionLimit: this.options.connectionLimit || 20,
        });

      } else {

      const jdbcUrl = this.options.url;
      const mysqlUrl = jdbcUrl.replace('jdbc:mysql://', '');
      const regex = /^(?:(.*?):(.*?)@)?([^:\/]+)(?::(\d+))?(\/.*)?$/;
      
      const matches = mysqlUrl.match(regex);
      
      if (matches) {
        const user = decodeURIComponent(matches[1] || '');
        const password = decodeURIComponent(matches[2] || '');
        const host = matches[3];
        const port = matches[4] || 3306;
        const database = matches[5] ? matches[5].slice(1) : '';
      
        this.client.db = mysql.createPool({
          host: host,
          user: user,
          password: password,
          database: database,
          port: port,
          connectionLimit: this.options.connectionLimit || 20,
        });
      } else {
        throw new TypeError("The provided URL is invalid.");
      }
    }
    

      if (!this.options.tables || this.options?.tables.length === 0) {
        throw new TypeError("Missing variable tables, please provide at least one table.");
      }
      
      const tableNameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
      
      this.options.tables.forEach(table => {
        if (!tableNameRegex.test(table)) {
          throw new TypeError(`Table names must start with a letter or an underscore and contain only letters, numbers, and underscores.`);
        }
      });      

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
      this.client.db.ping = pingResult;

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

    if (this.options.convertOldData && this.options.convertOldData.enabled === true) {
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
    let keyValue = id === undefined ? `${key}` : `${key}_${id}`;

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
    let keyValue = id === undefined ? `${key}` : `${key}_${id}`;
  
    if (typeof keyValue !== 'string') {
        console.warn(`[aoi.mysql] Invalid keyValue type: Expected string, got ${typeof keyValue}`);
        return;
    }

    if (typeof value === 'object') {
        value = JSON.stringify(value);
    } else if (typeof value !== 'string' && typeof value !== 'number') {
        console.warn(`[aoi.mysql] Invalid value type: Expected string, number, or object, got ${typeof value}`);
        return;
    }

    try {
        await this.client.db.promise().query(
            `INSERT INTO ${table} (\`var\`, \`key\`, \`value\`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE \`value\` = ?`,
            [key, keyValue, value, value]
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
    let keyValue = id === undefined ? `${key}` : `${key}_${id}`;

    try {
      await this.client.db.promise().query(`DELETE FROM ${table} WHERE \`key\` = ?`, [keyValue]);
    } catch (err) {
      return;
    }
  }

  async findMany(table, query, limit = 10) {
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
        await this.client.db.promise().query(`CREATE TABLE IF NOT EXISTS ${table} (\`var\` VARCHAR(255), \`key\` VARCHAR(255), \`value\` TEXT, PRIMARY KEY (\`var\`, \`key\`))`);
      }
    } catch (err) {
      return;
    }
  }

  async detectAndAlterFunctions() {
    const aoiMysqlDir = path.join('.', 'node_modules', 'aoi.mysql', 'functions');
    const aoiJsDir = path.join('.', 'node_modules', 'aoi.js', 'src', 'functions');
    
    const aoiMysqlBasePath = path.join('.', 'node_modules', 'aoi.mysql', 'functions', 'classes', 'AoiBase.js');
    const aoiJsBasePath = path.join('.', 'node_modules', 'aoi.js', 'src', 'classes', 'AoiBase.js');
  
    const files = fs.readdirSync(aoiMysqlDir);
    let altered = false;
  
    if (fs.existsSync(aoiMysqlBasePath) && fs.existsSync(aoiJsBasePath)) {
      const aoiMysqlBaseContent = fs.readFileSync(aoiMysqlBasePath, 'utf8');
      const aoiJsBaseContent = fs.readFileSync(aoiJsBasePath, 'utf8');
      
      if (aoiMysqlBaseContent !== aoiJsBaseContent) {
        altered = true;
        fs.copyFileSync(aoiMysqlBasePath, aoiJsBasePath);
      }
    } else {
      altered = true;
      fs.copyFileSync(aoiMysqlBasePath, aoiJsBasePath);
    }
  
    for (const file of files) {
      const aoiMysqlFilePath = path.join(aoiMysqlDir, file);
      const aoiJsFilePath = path.join(aoiJsDir, file);
  
      if (fs.statSync(aoiMysqlFilePath).isFile() && fs.existsSync(aoiJsFilePath)) {
        const aoiMysqlContent = fs.readFileSync(aoiMysqlFilePath, 'utf8');
        const aoiJsContent = fs.readFileSync(aoiJsFilePath, 'utf8');
    
        if (aoiMysqlContent !== aoiJsContent) {
          altered = true;
          fs.copyFileSync(aoiMysqlFilePath, aoiJsFilePath);
        }
      } else if (fs.statSync(aoiMysqlFilePath).isFile()) {
        altered = true;
        fs.copyFileSync(aoiMysqlFilePath, aoiJsFilePath);
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
