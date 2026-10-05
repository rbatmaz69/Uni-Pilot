# Third-party licenses

Uni-Pilot uses the following open-source packages:

## Flexoki

The optional Flexoki color palettes are by [Steph Ango](https://stephango.com/flexoki),
based on [Flexoki for Obsidian](https://github.com/kepano/flexoki-obsidian).
Copyright (c) 2023 Steph Ango. Distributed under the MIT License; the full text is in
[`licenses/flexoki-LICENSE`](licenses/flexoki-LICENSE).

## Tiptap

The Tiptap editor and the `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`,
`@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extensions`,
`@tiptap/extension-code-block`, `@tiptap/extension-details`,
`@tiptap/extension-highlight`, `@tiptap/extension-image`, `@tiptap/extension-list`,
`@tiptap/extension-mathematics`, `@tiptap/extension-paragraph`,
`@tiptap/extension-placeholder`, `@tiptap/extension-table`,
`@tiptap/extension-typography`, and `@tiptap/extension-underline` packages are
distributed under the MIT License.

Copyright (c) 2025 Tiptap GmbH

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## KaTeX

Formulas in notes are typeset with `katex`, distributed under the MIT License.
Its fonts are bundled with the desktop app. Source: https://github.com/KaTeX/KaTeX

Copyright (c) 2013-2020 Khan Academy and other contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Chemistry formulas (`\ce{…}`) use KaTeX's `mhchem` extension, which contains
code from the mhchem package for MathJax:

Copyright (c) 2011-2015 The MathJax Consortium
Copyright (c) 2015-2018 Martin Hensel

Licensed under the Apache License, Version 2.0; the full text is in
[`licenses/apache-2.0.txt`](licenses/apache-2.0.txt). Distributed on an "AS IS"
basis, without warranties or conditions of any kind.

## Mermaid diagrams

`mermaid` 12.0.0 is distributed under the MIT License. Mermaid and its
dependency license notices, versions, and source repositories are included in
[`licenses/mermaid-notices.txt`](licenses/mermaid-notices.txt) and bundled with
the desktop app. Source: https://github.com/mermaid-js/mermaid

The diagram renderer is loaded locally as a separate JavaScript module when
needed. Its dependencies include ELK under the Eclipse Public License 2.0;
the complete notices are in the linked file. Unmodified package sources are
available from their listed repositories. These packages can be replaced by
installing modified versions and rebuilding Uni Pilot from source.

## Document conversion

`pdf-lib` is distributed under the MIT License. Source and license text:
https://github.com/Hopding/pdf-lib

`heic-to` is distributed under the GNU Lesser General Public License,
version 3 or later. Its complete license text is in
[`licenses/heic-to-LICENSE`](licenses/heic-to-LICENSE). Source code:
https://github.com/hoppergee/heic-to

The HEIC decoder is loaded as a separate JavaScript module only when needed.
It can be replaced by installing a modified `heic-to` package and rebuilding
Uni Pilot from source.

## Excalidraw

The `@excalidraw/excalidraw` package is distributed under the MIT License.

Copyright (c) 2020 Excalidraw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Marked

The `marked` package, which `@tiptap/markdown` uses to parse Markdown, is
distributed under the MIT License.

Copyright (c) 2018+, MarkedJS (https://github.com/markedjs/)
Copyright (c) 2011-2018, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
