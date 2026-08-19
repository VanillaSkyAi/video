#!/usr/bin/env node

import { runVanillaSkyCli } from "./cli/index.js";

process.exitCode = await runVanillaSkyCli(process.argv.slice(2));
