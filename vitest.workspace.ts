const workspace = [
  {
    test: {
      environment: 'node',
      include: ['tests/**/*.spec.ts', 'packages/**/test/**/*.spec.ts'],
      name: 'pay-slip',
    },
  },
] as const;

export default workspace;
