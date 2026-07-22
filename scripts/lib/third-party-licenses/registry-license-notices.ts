export interface RegistryLicenseNotice {
	heading: string;
	render: (authorOrRightsholder: string) => string;
}

const MIT_TERMS = `Permission is hereby granted, free of charge, to any person obtaining a copy
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
SOFTWARE.`;

export const REGISTRY_LICENSE_NOTICES: Readonly<Record<string, RegistryLicenseNotice>> = {
	'CC-BY-4.0': {
		heading: 'Creative Commons Attribution 4.0 International',
		// CC BY 4.0 section 3(a)(1)(C) permits the license text OR a URI/hyperlink, and section
		// 3(a)(2) allows any reasonable attribution method for the medium. Keep both the deed and
		// legal-code links explicit instead of presenting this summary as the license itself.
		render: (
			authorOrRightsholder
		) => `Licensed material by ${authorOrRightsholder} is used under
the Creative Commons Attribution 4.0 International license. Recipients may share and adapt the
material for any purpose provided they give appropriate credit, link to the license, and indicate
whether changes were made. No additional legal or technological restrictions may be applied.

License deed: <https://creativecommons.org/licenses/by/4.0/>

Legal code: <https://creativecommons.org/licenses/by/4.0/legalcode>`,
	},
	MIT: {
		heading: 'MIT License',
		render: (authorOrRightsholder) => `Copyright (c) ${authorOrRightsholder}

${MIT_TERMS}`,
	},
};
