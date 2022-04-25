import fse from 'fs-extra';

console.log('copying translations from frontend..');
fse.copySync('../koekalenteri-frontend/src/i18n/locales', 'src/i18n/locales', {overwrite: true});
