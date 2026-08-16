#!/bin/bash

rm -rf -- dist/lambda

mkdir -p dist/lambda
mkdir -p dist/dependencies-layer/nodejs

node scripts/layer-modules.mjs
