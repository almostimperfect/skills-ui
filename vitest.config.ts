import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    // Allow importing .ts files with .js extension (NodeNext convention)
    extensionOrder: ['.ts', '.tsx', '.js'],
  },
})
