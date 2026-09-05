// Discovery is trusted server configuration; only retain action paths, never its origin.
export function discoveryAction(
  xml: string,
  extension: string,
  canEdit: boolean,
) {
  const actions = [...xml.matchAll(/<action\b([^>]+)>/g)].map((match) => {
    const attrs = Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((entry) => [
        entry[1],
        entry[2]
          .replaceAll("&amp;", "&")
          .replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">"),
      ]),
    );
    return attrs;
  });
  const action = actions.find(
    (a) => a.ext === extension && a.name === (canEdit ? "edit" : "view"),
  );
  if (!action?.urlsrc)
    throw new Error(
      "This document type is not supported by the office service.",
    );
  return action.urlsrc.replace(/<[^>]*>/g, "");
}
