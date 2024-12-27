const { readFileSync, readdirSync, existsSync, statSync, appendFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const chalk = require("chalk");
const ora = require("ora");

module.exports = async (client, options) => {
  const baseDir = join(__dirname, "../../../", options.convertOldData.dir);
  if (!existsSync(baseDir)) {
    console.error("[aoi.mysql]: " + chalk.red(`The '${options.convertOldData.dir}' folder does not exist.`));
    return;
  }

  const directories = readdirSync(baseDir);
  let total = 0;
  let index = 1;

  console.log("[aoi.mysql]: " + chalk.green("Starting conversion process..."));
  console.log("[aoi.mysql]: " + chalk.green("Code by Faf4a, edited by st333in"));

  for (const dir of directories) {
    if (["reference", ".backup", "transaction"].includes(dir)) continue;
    const dirPath = join(baseDir, dir);

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
    const dirPath = join(baseDir, dir);

    if (statSync(dirPath).isDirectory()) {
      const files = readdirSync(dirPath);

      for (const file of files) {
        const filePath = join(dirPath, file);
        const databaseData = readFileSync(filePath);
        const data = JSON.parse(databaseData);

        const progress = ora("[aoi.mysql]: Getting ready to backup (this may take a while depending on the amount of data)...\n\r").start();
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const tableName = file.split("_scheme_")[0];
        progress.text = `[aoi.mysql]: Transferring data from table ${chalk.yellow(tableName)}...`;
        await new Promise((resolve) => setTimeout(resolve, 3000));
        progress.stop();

        for (const [key, value] of Object.entries(data)) {
          const start = process.hrtime.bigint();
          const currentProgress = ora(`[${index}/${total}]: Processing ${chalk.yellow(key)}...`).start();

          const parts = key.split("_");
          const varKey = parts[0];
          const modifiedKey = parts.length === 1 || parts[1] === "" ? varKey : key;

          const serializedValue = typeof value.value === "object" ? JSON.stringify(value.value) : String(value.value);
          const previewValue = serializedValue.slice(0, 15);

          currentProgress.text = `[${index}/${total}]: Setting ${chalk.yellow(modifiedKey)} to '${previewValue}'`;

          const end = (Number(process.hrtime.bigint() - start) / 1e6).toFixed(2);

          try {
            await client.db.promise().query(
              `INSERT INTO ${tableName} (\`var\`, \`key\`, \`value\`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE \`value\` = ?`,
              [varKey, modifiedKey, serializedValue, serializedValue]
            );

            currentProgress.succeed(`[${index}/${total}] [${end}ms]: ${chalk.yellow(modifiedKey)} ${options.convertOldData.acknowledge ? "acknowledged write?: true" : ""}`);
          } catch (error) {
            currentProgress.fail(`[${index}/${total}] [${end}ms]: ${chalk.yellow(modifiedKey)} ${options.convertOldData.acknowledge ? "acknowledged write?: true" : ""}`);
            ora(`[aoi.mysql]: ${error.message}\n`).fail();

            const logPath = join(__dirname, "../../../conversion-logs.txt");
            const logData = `${error.message}\n${JSON.stringify({ key: modifiedKey, value }, null, 2)}\n\n`;

            if (!existsSync(logPath)) {
              writeFileSync(logPath, logData);
            } else {
              appendFileSync(logPath, logData);
            }
          }

          index++;
        }
      }
    }
  }

  ora("[aoi.mysql]: Transfer completed!").succeed();
  console.warn("[aoi.mysql]: " + chalk.blue("Disable the convert option, and check if data is equal before deleting database files!"));
};
