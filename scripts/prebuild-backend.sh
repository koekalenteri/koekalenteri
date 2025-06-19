#!/bin/bash

# rm -rf dist

mkdir -p dist/lambda
mkdir -p dist/layer/nodejs

node scripts/layer-modules.mjs
