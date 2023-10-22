build-GetEventsFunction:
	# Insert our symlink to layer node_modules
	ln -s /opt/nodejs/node_modules node_modules
	# create a zip with no root folder (npm pack adds a 'package' root folder that we dont want)
	zip -ry lambdaFunctionSrc.zip .
	# delete the ARTIFACTS_DIR created by SAM
	rm -rf "$(ARTIFACTS_DIR)"
	# replace ARTIFACTS_DIR with our ZIP file
	mv lambdaFunctionSrc.zip "$(ARTIFACTS_DIR)"
