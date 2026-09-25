const fs = require('fs');
const path = require('path');
const { compile } = require('json-schema-to-typescript');

// Recursively delete 'title' from inside properties so json-schema-to-typescript
// does not generate standalone type aliases for every primitive property field.
function stripPropertyTitles(node) {
  if (!node || typeof node !== 'object') return;

  if (node.properties && typeof node.properties === 'object') {
    for (const [propName, propDef] of Object.entries(node.properties)) {
      if (propDef && typeof propDef === 'object') {
        // If it's a primitive or inline object/array, remove title
        if (!propDef['$ref']) {
          delete propDef.title;
        }
        stripPropertyTitles(propDef);
      }
    }
  }

  if (node['$defs'] && typeof node['$defs'] === 'object') {
    for (const [defName, defObj] of Object.entries(node['$defs'])) {
      stripPropertyTitles(defObj);
    }
  }

  if (node.items && typeof node.items === 'object') {
    if (!node.items['$ref']) {
      delete node.items.title;
    }
    stripPropertyTitles(node.items);
  }
}

async function main() {
  const schemaDir = path.resolve(__dirname, '../../jsonschema');
  const outputFile = path.resolve(__dirname, '../src/generated.ts');

  const schemaFiles = fs.readdirSync(schemaDir)
    .filter(f => f.endsWith('.schema.json'))
    .sort();

  console.log(`Discovered ${schemaFiles.length} JSON Schemas in ${schemaDir}`);

  // Consolidated definitions map
  const consolidatedDefs = {};
  const rootModels = [];

  for (const file of schemaFiles) {
    const raw = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    const schema = JSON.parse(raw);
    const modelName = schema.title;

    if (!modelName) {
      throw new Error(`Schema ${file} has no title`);
    }

    rootModels.push(modelName);

    // Merge child $defs
    if (schema['$defs']) {
      for (const [defName, defObj] of Object.entries(schema['$defs'])) {
        if (!consolidatedDefs[defName]) {
          const cloned = JSON.parse(JSON.stringify(defObj));
          stripPropertyTitles(cloned);
          consolidatedDefs[defName] = cloned;
        }
      }
    }

    // Merge root model definition
    const rootDef = JSON.parse(JSON.stringify(schema));
    delete rootDef['$schema'];
    delete rootDef['$id'];
    delete rootDef['$defs'];
    stripPropertyTitles(rootDef);

    consolidatedDefs[modelName] = rootDef;
  }

  // Combined root schema
  const bundleSchema = {
    title: 'CocoonSchemaBundle',
    type: 'object',
    properties: {},
    definitions: consolidatedDefs,
    $defs: consolidatedDefs,
    additionalProperties: false
  };

  for (const modelName of rootModels) {
    bundleSchema.properties[modelName] = {
      $ref: `#/definitions/${modelName}`
    };
  }

  const header = [
    '/*',
    ' * AUTO-GENERATED FILE -- DO NOT EDIT DIRECTLY.',
    ' * Generated from JSON Schemas (Draft 2020-12) via json-schema-to-typescript.',
    ' * Canonical persisted source: packages/contracts/jsonschema/*.schema.json',
    ' */',
    '',
    "export const SCHEMA_VERSION = '4.0' as const;",
    'export type SchemaVersion = typeof SCHEMA_VERSION;',
    ''
  ].join('\n');

  console.log('Compiling schemas to TypeScript with json-schema-to-typescript...');
  let compiledTs = await compile(bundleSchema, 'CocoonSchemaBundle', {
    bannerComment: header,
    format: true,
    style: {
      singleQuote: true,
      semi: true,
      tabWidth: 2,
      printWidth: 100
    },
    ignoreMinAndMaxItems: true
  });

  // Remove the wrapper bundle interface so only pure domain interfaces and types remain
  compiledTs = compiledTs.replace(/export interface CocoonSchemaBundle\s*\{[\s\S]*?\n\}\n/, '');

  // Ensure no duplicate SchemaVersion type declaration
  compiledTs = compiledTs.replace(/export type SchemaVersion1\s*=\s*'4\.0';\n/g, '');
  compiledTs = compiledTs.replace(/export type SchemaVersion\s*=\s*'4\.0';\n/g, '');

  fs.writeFileSync(outputFile, compiledTs, 'utf8');
  console.log(`Successfully generated ${outputFile} (${compiledTs.length} bytes)`);
}

main().catch(err => {
  console.error('Error generating TypeScript definitions:', err);
  process.exit(1);
});
