# prettier-plugin-neos-fusion

A [Prettier](https://prettier.io) plugin for formatting [Neos Fusion](https://docs.neos.io/guide/manual/rendering/fusion) files.

## Installation

```bash
npm install --save-dev prettier prettier-plugin-neos-fusion
# or
yarn add -D prettier prettier-plugin-neos-fusion
```

## Configuration

Add the plugin to your Prettier config:

```json
{
  "plugins": ["prettier-plugin-neos-fusion"]
}
```

To use 2-space indentation for Fusion files (recommended):

```json
{
  "plugins": ["prettier-plugin-neos-fusion"],
  "overrides": [
    {
      "files": "**/*.fusion",
      "options": {
        "tabWidth": 2
      }
    }
  ]
}
```

## What it formats

- Prototype declarations and inheritance (`prototype(Foo:Bar) < prototype(Neos.Fusion:Component)`)
- Property assignments (`key = value`)
- All value types: strings, booleans, integers, floats, null, EEL expressions (`${...}`), Fusion object types
- DSL expressions (`afx\`...\``) — re-indented to match the surrounding context
- Value copy (`<`) and unset (`>`) operations
- `include:` statements
- `@meta` properties
- Blank lines between property groups are preserved
- `//`, `#`, and `/* */` comments

## VS Code

Install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension. Once the plugin is in your `node_modules` and registered in `.prettierrc`, format-on-save works automatically for `.fusion` files.
