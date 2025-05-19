#!/bin/bash

# rm -rf dist

mkdir -p dist/lambda
mkdir -p dist/layer/nodejs

node scripts/build-template.mjs
node scripts/layer-modules.mjs
