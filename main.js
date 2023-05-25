import { exec, spawn } from "child_process";
import { readdir } from "fs/promises";
import inquirer from "inquirer";
import moment from "moment";
import { MongoClient } from "mongodb";

const prompt = inquirer.createPromptModule();

const getDirectories = async source =>
  (await readdir(source, { withFileTypes: true }))
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

async function performBackup(databaseName) {
  try {
    const timestamp = moment().format("DD.MM.YYYY_HHmmss");
    const { backupFolder } = await prompt([
      {
        type: "input",
        name: "backupFolder",
        message: "Enter the backup folder path (leave empty for default):",
        default: `${databaseName}_${timestamp}`,
      },
    ]);

    // const defaultBackupFolder = `${databaseName}_${timestamp}`;
    const folderName = "dumps/" + backupFolder;
    const backupCommand = `mongodump --db ${databaseName} --out ${folderName}`;

    console.log(`Creating backup of database ${databaseName}...`);
    await exec(backupCommand);

    console.log(`Backup created successfully in folder ${folderName}.`);
  } catch (error) {
    console.error("An error occurred during the backup process:", error);
  }
}

function performRestore(restoreFolder, uri) {
  try {
    console.log(`Restoring database from folder ${restoreFolder}...`);
    let ls = spawn("mongorestore", ["--uri", uri, "--drop", restoreFolder]);

    ls.stdout.on("data", function (data) {
      console.log(data.toString());
    });

    ls.stderr.on("data", function (data) {
      console.log(data.toString());
    });

    ls.on("exit", function (code) {
      console.log("child process exited with code " + code.toString());
    });

    console.log("Database restored successfully.");
  } catch (error) {
    console.error("An error occurred during the restore process:", error);
  }
}

function generateConnectionString({ username, password, host, port }) {
  let credentials = "";

  if (username && password) {
    credentials = `${username}:${password}@`;
  }

  const uri = `mongodb://${credentials}${host}:${port}`;

  return uri;
}

async function main() {
  try {
    const credentials = await prompt([
      {
        type: "input",
        name: "username",
        message: "Enter your MongoDB username:",
      },
      {
        type: "password",
        name: "password",
        message: "Enter your MongoDB password:",
      },
      {
        type: "input",
        name: "host",
        message: "Enter the MongoDB host:",
        default: "localhost",
      },
      {
        type: "input",
        name: "port",
        message: "Enter the MongoDB port:",
        default: "27017",
      },
    ]);

    const uri = generateConnectionString(credentials);

    const client = new MongoClient(uri);

    await client.connect();
    console.log("Connected to MongoDB successfully.");

    const { action } = await prompt([
      {
        type: "list",
        name: "action",
        message: "Choose an action:",
        choices: ["Backup", "Restore"],
      },
    ]);

    if (action === "Backup") {
      const { databaseName } = await prompt([
        {
          type: "list",
          name: "databaseName",
          message: "Choose a database to backup:",
          choices: await client
            .db()
            .admin()
            .listDatabases()
            .then(({ databases }) => databases.map(({ name }) => name)),
        },
      ]);

      await performBackup(databaseName);
    } else if (action === "Restore") {
      try {
        const dirs = await getDirectories("./dumps");
        const { restoreFolder } = await prompt([
          {
            type: "list",
            name: "restoreFolder",
            message: "Choose the folder to restore from:",
            choices: dirs,
          },
        ]);

        await performRestore("./dumps/" + restoreFolder, uri);
      } catch (err) {
        if (err.errno === -2) {
          console.log("No 'dumps' dir found");
        } else {
          throw new Error(err);
        }
        console.log("Disconnected from MongoDB.");
        await client.close();
        return;
      }
    }

    await client.close();
    console.log("Disconnected from MongoDB.");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
