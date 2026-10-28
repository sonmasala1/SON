import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import mongoose from "mongoose";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const runtime = path.join(root, "backend", ".runtime", "mongo-demo");
fs.mkdirSync(runtime, { recursive: true });
let executable = process.env.MONGOD_BINARY;
if (!executable && process.platform === "win32") {
  const base = "C:/Program Files/MongoDB/Server";
  const versions = fs
    .readdirSync(base)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  executable = path.join(base, versions[0], "bin", "mongod.exe");
}
executable ||= "mongod";
let connection;
try {
  try {
    connection = await mongoose
      .createConnection(
        "mongodb://127.0.0.1:27018/admin?directConnection=true",
        { serverSelectionTimeoutMS: 700 },
      )
      .asPromise();
  } catch {
    const child = spawn(
      executable,
      [
        "--dbpath",
        runtime,
        "--port",
        "27018",
        "--bind_ip",
        "127.0.0.1",
        "--replSet",
        "sonDemo",
        "--logpath",
        path.join(runtime, "mongod.log"),
        "--logappend",
      ],
      { detached: true, windowsHide: true, stdio: "ignore" },
    );
    child.unref();
    for (let attempt = 0; attempt < 20 && !connection; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        connection = await mongoose
          .createConnection(
            "mongodb://127.0.0.1:27018/admin?directConnection=true",
            { serverSelectionTimeoutMS: 500 },
          )
          .asPromise();
      } catch {
        /* Retry while starting. */
      }
    }
  }
  if (!connection) throw new Error("MongoDB demo instance could not start");
  const admin = connection.db.admin();
  const hello = await admin.command({ hello: 1 });
  if (hello.setName && hello.setName !== "sonDemo")
    throw new Error("Port 27018 belongs to a different replica set");
  if (!hello.setName)
    await admin.command({
      replSetInitiate: {
        _id: "sonDemo",
        members: [{ _id: 0, host: "127.0.0.1:27018" }],
      },
    });
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if ((await admin.command({ hello: 1 })).isWritablePrimary) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Replica set primary was not elected");
  console.log(
    "Isolated demo replica set ready at 127.0.0.1:27018. Existing MongoDB on port 27017 is unchanged.",
  );
  if (process.argv.includes("--configure")) {
    const filename = path.join(root, "backend", ".env");
    let contents = fs.readFileSync(filename, "utf8");
    for (const [key, value] of Object.entries({
      MONGODB_URI:
        "mongodb://127.0.0.1:27018/son_masala_demo?replicaSet=sonDemo",
      ENABLE_DEMO_CHECKOUT: "true",
    })) {
      const pattern = new RegExp(`^${key}=.*$`, "m");
      contents = pattern.test(contents)
        ? contents.replace(pattern, `${key}=${value}`)
        : contents + `\n${key}=${value}\n`;
    }
    fs.writeFileSync(filename, contents);
    console.log(
      "backend/.env now targets the isolated development demo database.",
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (connection) await connection.close();
}
