build-%:
	rm -rf i18n lambda/lib lambda/types lambda/utils
	ln -s /opt/nodejs/node_modules node_modules
	ln -s /opt/nodejs/i18n i18n
	ln -s /opt/nodejs/lambda/lib lambda/lib
	ln -s /opt/nodejs/lambda/types lambda/types
	ln -s /opt/nodejs/lambda/utils lambda/utils
	zip -qry lambdaFunctionSrc.zip "lambda/$(*)" "node_modules" "i18n" "lambda/lib" "lambda/types" "lambda/utils" ""lambda/config.mjs""
	rm -rf "$(ARTIFACTS_DIR)"
	mv lambdaFunctionSrc.zip "$(ARTIFACTS_DIR)"
