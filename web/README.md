# Overview

Koekalenteri frontend is written in [TypeScript](https://www.typescriptlang.org/) and is based on the following major libraries:

* [React](https://reactjs.org) - UI framework
* [MobX](https://mobx.js.org/) - State management

## Development

First you need to create a `.env` file (copy `.env.sample` and fill in values).

### Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

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
