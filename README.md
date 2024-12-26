## aoi.js-mysql

- Easy to use package for the implementation of MySQL (MariaDB) in aoi.js with minimal changes.

### Setup

To get started with aoi.js-mysql, we have to do a couple things.

- Install the package.
```bash
npm install github:st333in/aoi.mariadb
```

- Update your index.js file.

```js
const { AoiClient, LoadCommands } = require("aoi.js");
const { Database } = require("aoi.mariadb");

const client = new AoiClient({
  token: "DISCORD BOT TOKEN",
  prefix: "DISCORD BOT PREFIX",
  intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
  events: ["onInteractionCreate", "onMessage"],
  disableAoiDB: true // This is important, ensure it's set to true. You can't use both at once.
});

const database = new Database(client, {
  host: " ",        
  user: " ", 
  password: " ",
  database: " ",
  port: 3306, //Not required, default 3306
  connectionLimit: 20,
  tables: ["main"]
});

client.variables({
    variable: "value"
});

// rest of your index.js..
```

## Transfer aoi.db database

You can indeed transfer your database!

```js
const { AoiClient, LoadCommands } = require("aoi.js");
const { Database } = require("aoi.mongo");

const client = new AoiClient({
  token: "DISCORD BOT TOKEN",
  prefix: "DISCORD BOT PREFIX",
  intents: ["Guilds", "GuildMessages", "GuildMembers", "MessageContent"],
  events: ["onInteractionCreate", "onMessage"],
  disableAoiDB: true // This is important, ensure it's set to true. You can't use both at once.
});

const database = new Database(client, {
  host: " ",        
  user: " ", 
  password: " ",
  database: " ",
  port: 3306, //Not required, default 3306
  connectionLimit: 20,
  tables: ["main"],
    convertOldData: {
      enabled: true,
      dir: "./database"
    },
});

client.variables({
    variable: "value"
});

// rest of your index.js..
```

### Uninstalling

aoi.mariadb modifies certain functions of aoi.js, however, when you uninstall this package, make sure you reinstall aoi.js so that everything works perfectly. Follow the example below:

```js
npm r aoi.mariadb
```
```js
npm i aoi.js
```
