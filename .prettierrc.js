/** @type {import("prettier").Config} */
module.exports = {
  trailingComma: "all",
  tabWidth: 2,
  semi: true,
  singleQuote: false,
  printWidth: 120,
  bracketSpacing: true,
  plugins: ["prettier-plugin-solidity"],
  overrides: [
    {
      files: "*.sol",
      options: {
        parser: "solidity-parse",
        bracketSpacing: true,
        printWidth: 120,
        singleQuote: false,
        tabWidth: 2,
        useTabs: false,
      },
    },
  ],
};
