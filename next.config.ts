import type { NextConfig } from "next";
import path from "path";

// Pins the project root explicitly: without this, Next.js walks up looking for a lockfile
// and finds a stray package-lock.json in the home directory, misdetecting a monorepo root
// there. That mismatch between the inferred root and this project's actual path causes a
// case-casing split in webpack's module graph (two "different" copies of react/react-dom),
// which crashes static prerendering with "Cannot read properties of null (reading 'useContext')".
const projectRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
