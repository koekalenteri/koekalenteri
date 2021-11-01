# Overview

Koekalenteri frontend is written in [TypeScript](https://www.typescriptlang.org/) and is based on the following major libraries:

* [React](https://reactjs.org) - UI framework
* [MobX](https://mobx.js.org/) - State management

## Development

### Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

By default, local backend is used. You can use alternative backed by defining `REACT_APP_API_BASE_URL` environment variable (deployed backends are a lot faster, because `sam` rebuilds the lambda for every request).

For example (windows):

```powershell
($env:REACT_APP_API_BASE_URL = 'https://xyz.execute-api.eu-north-1.amazonaws.com/dev') -and (npm start)
```

*nix:

```bash
REACT_APP_API_BASE_URL=https://xyz.execute-api.eu-north-1.amazonaws.com/dev npm start
```

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run lint`

Perform code linting using ESLint

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

## Deployment

After project is deployed to Amplify, following redirects need to be defined (in Amplify comsole):

```json
[{
  "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>",
  "status": "200",
  "target": "/index.html",
  "condition": null
}]
```
