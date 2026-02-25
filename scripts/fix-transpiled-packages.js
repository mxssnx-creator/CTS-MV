// Fix for Turbopack panic: default-transpiled-packages.json not found
// This creates the missing file in the next package's dist/lib directory
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

// Find the next package in node_modules
const possiblePaths = [
  join(process.cwd(), 'node_modules', 'next', 'dist', 'lib'),
  join(process.cwd(), 'node_modules', '.pnpm', 'next@16.1.6_react-dom@19.2.4_react@19.2.4__react@19.2.4', 'node_modules', 'next', 'dist', 'lib'),
];

const content = JSON.stringify(["geist"]);

for (const dir of possiblePaths) {
  const filePath = join(dir, 'default-transpiled-packages.json');
  if (!existsSync(filePath)) {
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(filePath, content, 'utf8');
      console.log(`[v0] Created missing default-transpiled-packages.json at: ${filePath}`);
    } catch (e) {
      console.log(`[v0] Could not create at ${filePath}: ${e.message}`);
    }
  } else {
    console.log(`[v0] default-transpiled-packages.json already exists at: ${filePath}`);
  }
}
