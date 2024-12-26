const { readFileSync, readdirSync, existsSync, statSync } = require("fs");
const { join } = require("path");
const chalk = require("chalk");
const ora = require("ora");

module.exports = async (client, options) => {
  if (!existsSync(join(__dirname, "../../../", options.convertOldData.dir))) {
    console.error("[aoi.mysql]: " + chalk.red(`The '${options.convertOldData.dir}' folder does not exist.`));
    return;
  }

  const directories = readdirSync(join(__dirname, "../../../", options.convertOldData.dir));
  let progress;
  let total = 0;
  let index = 1;

  console.log("[aoi.mysql]: " + chalk.green("Starting conversion process..."));
  console.log("[aoi.mysql]: " + chalk.green("Code by Faf4a, edited by st333in"));

  for (const dir of directories) {
    if (["reference", ".backup", "transaction"].includes(dir)) continue;
    const dirPath = join(__dirname, "../../../", options.convertOldData.dir, dir);

    if (statSync(dirPath).isDirectory()) {
      const files = readdirSync(dirPath);
      for (const file of files) {
        const filePath = join(dirPath, file);
        const databaseData = readFileSync(filePath);
        const data = JSON.parse(databaseData);
        total += Object.keys(data).length;
      }
    }
  }

  console.warn("[aoi.mysql]: " + chalk.red("This process may take a while depending on the amount of data and database server."));
  console.log(`[aoi.mysql]: Found ${chalk.yellow(total)} keys to transfer.`);

  for (const dir of directories) {
    if (["reference", ".backup", "transaction"].includes(dir)) continue;
    const dirPath = join(__dirname, "../../../", options.convertOldData.dir, dir);

    if (statSync(dirPath).isDirectory()) {
      const files = readdirSync(dirPath);

      for (const file of files) {
        const filePath = join(dirPath, file);
        const databaseData = readFileSync(filePath);
        const data = JSON.parse(databaseData);

        progress = ora("[aoi.mysql]: Getting ready to backup (this may take a while depending on the amount of data)...\n\r").start();
        await new Promise((resolve) => setTimeout(resolve, 1e3));

        const tableName = file.split("_scheme_")[0];
        progress.text = `[aoi.mysql]: Transferring data from table ${chalk.yellow(tableName)}...`;
        await new Promise((resolve) => setTimeout(resolve, 3e3));
        progress.stop();

        for (const [key, value] of Object.entries(data)) {
          const start = process.hrtime.bigint();
          const currentProgress = ora(`[${index}/${total}]: Processing ${chalk.yellow(key)}...`).start();

          const keyWithoutId = key.replace(/_\d+$/, "");

          currentProgress.text = `[${index}/${total}]: Setting ${chalk.yellow(key)} to '${chalk.cyan(value.value).slice(0, 15)}'`;

          const end = (Number(process.hrtime.bigint() - start) / 1e6).toFixed(2);

          try {
            await client.db.promise().query(
              `INSERT INTO ${tableName} (\`key\`, \`value\`) VALUES (?, ?) ON DUPLICATE KEY UPDATE \`value\` = ?`,
              [key, value.value, value.value]
            );
            
            currentProgress.succeed(`[${index}/${total}] [${end}ms]: ${chalk.yellow(key)} ${options.convertOldData.acknowledge ? "acknowledged write?: true" : ""}`);

          } catch (error) {
            currentProgress.fail(`[${index}/${total}] [${end}ms]: ${chalk.yellow(key)} ${options.convertOldData.acknowledge ? "acknowledged write?: true" : ""}`);
            progress.fail(`[aoi.mysql]: ${error.message}\n`);
          }

          index++;
        }
      }
    }
  }

  progress.succeed("[aoi.mysql]: Transfer completed!");
  console.warn("[aoi.mysql]: " + chalk.blue("Disable the convert option, and check if data is equal before delete database files!"));
};