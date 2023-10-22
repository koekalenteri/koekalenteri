build-%:
	ln -s /opt/nodejs/node_modules node_modules
	zip -qry lambdaFunctionSrc.zip .
	rm -rf "$(ARTIFACTS_DIR)"
	mv lambdaFunctionSrc.zip "$(ARTIFACTS_DIR)"
