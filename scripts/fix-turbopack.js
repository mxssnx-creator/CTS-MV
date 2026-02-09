#!/usr/bin/env node

/**
 * This script creates the missing Next.js default-transpiled-packages.json file
 * that Turbopack is looking for. This file tells Turbopack which packages
 * should be transpiled by Turbopack itself vs left as-is.
 */

const fs = require('fs');
const path = require('path');

// Find the Next.js dist/lib directory
const nextPaths = [
  'node_modules/next/dist/lib',
  'node_modules/.pnpm/next@16.0.10/node_modules/next/dist/lib',
  'node_modules/.pnpm/next@16.1.6_@babel+core@7.29.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/lib',
];

// The minimal default transpiled packages configuration
const defaultTranspiledPackages = [
  '@daishi/zustand',
  '@emotion/cache',
  '@emotion/react',
  '@emotion/styled',
  '@mdx-js/react',
  '@mantine/core',
  '@mantine/hooks',
  '@mantine/next',
  '@material-ui/core',
  '@material-ui/icons',
  '@mui/core',
  '@mui/icons-material',
  '@mui/joy',
  '@mui/material',
  '@mui/system',
  '@nextui-org/react',
  '@react-three/drei',
  '@react-three/fiber',
  '@stripe/react-stripe-js',
  'antd',
  'geist',
  'lucide-react',
];

function createFile() {
  for (const nextPath of nextPaths) {
    const fullPath = path.join(process.cwd(), nextPath);
    
    if (fs.existsSync(path.dirname(fullPath))) {
      try {
        fs.writeFileSync(
          path.join(fullPath, 'default-transpiled-packages.json'),
          JSON.stringify(defaultTranspiledPackages, null, 2)
        );
        console.log(`[v0] Created default-transpiled-packages.json at ${fullPath}`);
        return true;
      } catch (err) {
        continue;
      }
    }
  }
  
  console.log('[v0] Could not create default-transpiled-packages.json - using fallback');
  return false;
}

createFile();
