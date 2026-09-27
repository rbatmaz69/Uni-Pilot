// Fill the document card from the top, like an image cover, instead of shrinking
// the entire first page until its text becomes illegible.
export function pdfCoverScale(pageWidth: number, pageHeight: number) {
  return Math.max(176 / pageWidth, 177 / pageHeight);
}
