# Useful tools dependencies

The Image Eraser and Markdown Viewer were adapted from the owner's supplied `3_Useful_Tools.zip`. Their original processing and rendering code is retained; GaryHub adds navigation, theme support, local-file protections and login entry points.

PDF Gray is a browser implementation of the supplied Python converter's grayscale lookup mapping. It bundles:

- PDF.js 5.6.205, compatibility (`legacy/build`) modules, CMaps, standard fonts and decoder WASM. Apache-2.0; see `vendor/PDFJS-LICENSE.txt` and bundled font/decoder license files.
- pdf-lib 1.17.1 browser bundle. MIT; see `vendor/PDF-LIB-LICENSE.txt`.

All required browser assets are hosted locally. PDF rendering uses a dedicated worker; file bytes are not uploaded. Original page sizes and rotation display are flattened into PNG images in the resulting PDF.
