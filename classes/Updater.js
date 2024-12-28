const { exec } = require('child_process');
const { writeFileSync, appendFileSync, existsSync } = require('fs');
const { join } = require('path');
const chalk = require('chalk');
const ora = require('ora');
const https = require("https");

module.exports = async (client, options) => {
  const { version, autoUpdate } = options;

  if (!autoUpdate) {
    return;
  }

  const spinner = ora("[aoi.mysql]: Starting update process...").start();

  try {
    const latestVersion = await checkLatestVersion();
    if (!latestVersion || latestVersion === version) {
      spinner.succeed("[aoi.mysql]: The system is up to date.");
      return;
    }

    spinner.text = `[aoi.mysql]: New version found: v${latestVersion}, proceeding with update...`;
    spinner.start();

    await updatePackage();

    const successMessage = `[aoi.mysql]: Update completed successfully, restarting bot...`;
    spinner.succeed(successMessage);

    process.exit(1);
  } catch (error) {
    spinner.fail(`[aoi.mysql]: Error in update: ${error.message}`);
  }
};

async function checkLatestVersion() {
  return new Promise((resolve, reject) => {
    https.get('https://registry.npmjs.org/aoi.mysql', (res) => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          const latestVersion = jsonData['dist-tags'] ? jsonData['dist-tags'].latest : null;
          resolve(latestVersion);
        } catch (err) {
          reject(new Error('Failed to fetch the latest version.'));
        }
      });
    }).on('error', (err) => {
      reject(new Error('Error fetching version info.'));
    });
  });
}

function updatePackage() {
  return new Promise((resolve, reject) => {
    exec('npm install aoi.mysql@latest', (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Exec error: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}