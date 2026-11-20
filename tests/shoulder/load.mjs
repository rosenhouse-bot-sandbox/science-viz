// Loads the Shoulder page's model in Node, from the same files the page loads.
import fs from 'node:fs';
import path from 'node:path';
import { unpack, makeModel } from '../../js/shoulder/model.js';
const root = path.resolve(import.meta.dirname, '../..');
const read = (f) => fs.readFileSync(path.join(root, 'shoulder/data', f));
const bin = read('bones.bin');
export const bones = unpack(JSON.parse(read('bones.json')), bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
export const musclesJson = JSON.parse(read('muscles.json'));
export const table = fs.existsSync(path.join(root, 'shoulder/data/pose.json')) ? JSON.parse(read('pose.json')) : null;
export const model = makeModel(bones, musclesJson, table);
// the same model working everything out afresh, for checking the stored table
export const fresh = () => makeModel(bones, musclesJson);
