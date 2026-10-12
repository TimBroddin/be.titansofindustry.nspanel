#!/usr/bin/env node
/**
 * Patches esphome-native-api to handle unknown message types gracefully
 * ESPHome versions after 2020 have many new message types that the library doesn't support
 */

const fs = require('fs');
const path = require('path');

const messagesPath = path.join(__dirname, '..', 'node_modules', 'esphome-native-api', 'lib', 'utils', 'messages.js');

if (!fs.existsSync(messagesPath)) {
  console.log('esphome-native-api not installed yet, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(messagesPath, 'utf8');

// Check if already patched
if (content.includes('// PATCHED')) {
  console.log('esphome-native-api already patched');
  process.exit(0);
}

// Find the deserialize function and patch it to handle unknown message types
const originalDeserialize = `const message = pb[id_to_type[message_id]].deserializeBinary(buffer.slice(offset, message_length + offset));`;

const patchedDeserialize = `// PATCHED: Handle unknown message types gracefully
        const messageType = id_to_type[message_id];
        if (!messageType || !pb[messageType]) {
            // Unknown message type - skip it but return a dummy message to keep parsing
            const dummyMessage = { length: message_length + offset, toObject: () => ({ _unknown: true, _id: message_id }) };
            dummyMessage.constructor = { type: 'UnknownMessage_' + message_id };
            return dummyMessage;
        }
        const message = pb[messageType].deserializeBinary(buffer.slice(offset, message_length + offset));`;

if (content.includes(originalDeserialize)) {
  content = content.replace(originalDeserialize, patchedDeserialize);
  fs.writeFileSync(messagesPath, content);
  console.log('Successfully patched esphome-native-api to handle unknown message types');
} else {
  console.log('Could not find deserialize pattern to patch - library may have changed');
  process.exit(1);
}
