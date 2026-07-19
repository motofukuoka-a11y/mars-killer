export default [
  {
    files: [
      'ui/DynamicCardList.js',
      'ui/PassengerCardList.js',
      'ui/SectionCardList.js',
      'ui/Version51StateController.js',
      'services/PassengerModel.js',
      'services/SectionServiceManager.js',
      'tests/version60-ui-card-refactor.mjs'
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        CustomEvent: 'readonly',
        console: 'readonly'
      }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', {argsIgnorePattern: '^_'}],
      'no-dupe-class-members': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'eqeqeq': ['error', 'always', {null: 'ignore'}]
    }
  }
];
