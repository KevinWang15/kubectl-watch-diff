#!/usr/bin/env node

const diff = require("diff");
const chalk = require("chalk");
const split2 = require("split2");
const dayjs = require("dayjs");
const jsonmergepatch = require("json-merge-patch");

(async function main() {
    process.stdin.pipe(split2()).on('data', processData);
})()

const objects = {};
let dataBuffer = "";

function processData(line) {
    dataBuffer += line + "\n";

    let watchEvent;
    try {
        watchEvent = JSON.parse(dataBuffer);
    } catch (ex) {
        // stream not complete yet
        return
    }

    dataBuffer = "";

    processWatchEvent(watchEvent);
}

function processWatchEvent(watchEvent) {
    const {type, object} = watchEvent;

    if (!object.metadata.name && object.items) {
        // handle chunking
        object.items.forEach(object => {
            processWatchEvent({type, object});
        })
        return;
    }

    const namespacedName = getNamespacedName(object);
    prettyPrintEvent(type, namespacedName, object);

    if (type === "DELETED") {
        objects[namespacedName] = undefined;
    } else {
        objects[namespacedName] = object;
    }
}

function prettyPrintEvent(type, namespacedName, object) {
    const time = dayjs().format();
    console.log(`${chalk.gray(time)} ${chalk.bold(prettyPrintType(type) + ": ")} ${namespacedName || ""}`)

    if (type === "ERROR") {
        console.log("  ", JSON.stringify(object));
    }
    if (type === "MODIFIED") {
        const patch = jsonmergepatch.generate(objects[namespacedName], object);
        const reversePatch = jsonmergepatch.generate(object, objects[namespacedName]);
        console.log("  ", prettyPrintDiff(reversePatch, patch));
    }
}

function prettyPrintType(type) {
    if (type === "ADDED") {
        return chalk.green(type);
    } else if (type === "MODIFIED") {
        return chalk.yellow(type);
    } else if (type === "DELETED") {
        return chalk.red(type);
    } else if (type === "ERROR") {
        return chalk.bgRed(chalk.white(type));
    } else {
        return type;
    }
}

function prettyPrintDiff(reversePatch, patch) {
    return diff.diffWords(JSON.stringify(reversePatch), JSON.stringify(patch)).map(segment => {
        if (segment.added) {
            return chalk.green(chalk.underline(segment.value));
        } else if (segment.removed) {
            return chalk.red(chalk.strikethrough(segment.value));
        } else {
            return segment.value;
        }
    }).join('');
}

function getNamespacedName(object) {
    if (object.metadata.namespace) {
        return `${object.metadata.namespace}/${object.metadata.name}`;
    } else {
        return object.metadata.name;
    }
}
