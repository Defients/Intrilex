// Lightweight JSON Schema validator for Intrilex schemas.
// Supports the subset of JSON Schema Draft 2020-12 used by the 5 Intrilex schemas:
//   type, required, properties, const, enum, minimum, items, additionalProperties.
// No external dependencies — self-contained, deterministic, fail-visible.
//
// Usage:
//   import { validateAgainstSchema, validateFile } from './validate-schema.mjs';
//   const errors = validateAgainstSchema(data, schema);
//   if (errors.length) throw new Error(`Schema validation failed:\n${errors.join('\n')}`);

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Validate data against a JSON Schema (subset of Draft 2020-12).
 * @param {*} data — the data to validate
 * @param {object} schema — the JSON Schema
 * @param {string} instancePath — current path (for error messages)
 * @returns {string[]} array of error messages (empty = valid)
 */
export function validateAgainstSchema(data, schema, instancePath = '') {
  const errors = [];

  if (!schema || typeof schema !== 'object') return errors;

  // type check
  if (schema.type) {
    const typeError = checkType(data, schema.type, instancePath);
    if (typeError) errors.push(typeError);
  }

  // const check
  if (schema.const !== undefined) {
    if (!deepEqual(data, schema.const)) {
      errors.push(`${instancePath || 'root'}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(data)}`);
    }
  }

  // enum check
  if (schema.enum) {
    if (!schema.enum.some(v => deepEqual(data, v))) {
      errors.push(`${instancePath || 'root'}: value ${JSON.stringify(data)} not in enum [${schema.enum.map(v => JSON.stringify(v)).join(', ')}]`);
    }
  }

  // minimum check (for numbers/integers)
  if (schema.minimum !== undefined && typeof data === 'number') {
    if (data < schema.minimum) {
      errors.push(`${instancePath || 'root'}: value ${data} below minimum ${schema.minimum}`);
    }
  }

  // items (for arrays) — must run before the object-only early return
  if (schema.items && Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const itemPath = `${instancePath}[${i}]`;
      const itemErrors = validateAgainstSchema(data[i], schema.items, itemPath);
      errors.push(...itemErrors);
    }
  }

  // Only validate properties/required for objects
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return errors;

  // required fields
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push(`${instancePath || 'root'}: missing required property "${field}"`);
      }
    }
  }

  // properties
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        const childPath = instancePath ? `${instancePath}.${key}` : key;
        const childErrors = validateAgainstSchema(data[key], propSchema, childPath);
        errors.push(...childErrors);
      }
    }
  }

  // additionalProperties: false means no unknown properties allowed
  if (schema.additionalProperties === false && schema.properties) {
    const knownKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(data)) {
      if (!knownKeys.has(key)) {
        errors.push(`${instancePath || 'root'}: additional property "${key}" not allowed`);
      }
    }
  }

  return errors;
}

function checkType(data, type, path) {
  const actual = Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data;
  // JSON Schema "integer" matches numbers without fractional part
  if (type === 'integer') {
    if (typeof data !== 'number' || !Number.isInteger(data)) {
      return `${path || 'root'}: expected type integer, got ${actual}`;
    }
    return null;
  }
  if (type === 'number') {
    if (typeof data !== 'number') {
      return `${path || 'root'}: expected type number, got ${actual}`;
    }
    return null;
  }
  if (type === 'object') {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return `${path || 'root'}: expected type object, got ${actual}`;
    }
    return null;
  }
  if (type === 'array') {
    if (!Array.isArray(data)) {
      return `${path || 'root'}: expected type array, got ${actual}`;
    }
    return null;
  }
  if (type === 'string') {
    if (typeof data !== 'string') {
      return `${path || 'root'}: expected type string, got ${actual}`;
    }
    return null;
  }
  if (type === 'boolean') {
    if (typeof data !== 'boolean') {
      return `${path || 'root'}: expected type boolean, got ${actual}`;
    }
    return null;
  }
  return null;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    return ak.length === bk.length && ak.every(k => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Validate a JSON file against a schema file.
 * @param {string} dataPath — path to the JSON data file
 * @param {string} schemaPath — path to the JSON Schema file
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
export async function validateFile(dataPath, schemaPath) {
  const [dataRaw, schemaRaw] = await Promise.all([
    readFile(dataPath, 'utf8'),
    readFile(schemaPath, 'utf8'),
  ]);
  const data = JSON.parse(dataRaw);
  const schema = JSON.parse(schemaRaw);
  const errors = validateAgainstSchema(data, schema);
  return { valid: errors.length === 0, errors };
}

// ── CLI ──
// Usage: node scripts/validate-schema.mjs <data.json> <schema.json>
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace('file://', ''))) {
  const [dataPath, schemaPath] = process.argv.slice(2);
  if (!dataPath || !schemaPath) {
    console.error('Usage: node scripts/validate-schema.mjs <data.json> <schema.json>');
    process.exit(2);
  }
  try {
    const result = await validateFile(
      path.resolve(dataPath),
      path.resolve(schemaPath),
    );
    if (result.valid) {
      console.log(`SCHEMA VALIDATE PASS: ${dataPath} against ${schemaPath}`);
    } else {
      console.error(`SCHEMA VALIDATE FAIL: ${dataPath} against ${schemaPath}`);
      for (const err of result.errors) console.error(`  ${err}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`SCHEMA VALIDATE ERROR: ${err.message}`);
    process.exit(1);
  }
}
