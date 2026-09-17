import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/spike-bundle.js',
      formats: ['es'],
      fileName: () => 'orbit-spike-bundle.js',
    },
    minify: 'esbuild',
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    reportCompressedSize: true,
  },
})
