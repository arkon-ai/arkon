import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../../_utils";

type DocumentRow = {
  file_path: string | null;
  id: number;
  title: string;
  pinned: boolean;
  word_count: number | null;
};

type TreeNode = {
  name: string;
  children: TreeNode[];
  isFile: boolean;
  id?: number;
  title?: string;
  pinned?: boolean;
  words?: number | null;
};

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const result = (await query(
      "SELECT file_path, id, title, pinned, word_count FROM documents ORDER BY file_path"
    )) as { rows: DocumentRow[] };

    const tree: TreeNode = {
      name: "workspace",
      children: [],
      isFile: false,
    };

    for (const row of result.rows) {
      if (!row.file_path) continue;

      const parts = row.file_path.split("/").filter(Boolean);
      if (!parts.length) continue;

      let current = tree;

      for (const [index, part] of parts.entries()) {
        const isFile = index === parts.length - 1;
        let child = current.children.find((node) => node.name === part && node.isFile === isFile);

        if (!child) {
          child = {
            name: part,
            children: [],
            isFile,
          };
          current.children.push(child);
        }

        if (isFile) {
          child.id = row.id;
          child.title = row.title;
          child.pinned = row.pinned;
          child.words = row.word_count;
        } else {
          child.children.sort((left, right) => {
            if (left.isFile !== right.isFile) return left.isFile ? 1 : -1;
            return left.name.localeCompare(right.name);
          });
        }

        current = child;
      }
    }

    const sortTree = (node: TreeNode) => {
      node.children.sort((left, right) => {
        if (left.isFile !== right.isFile) return left.isFile ? 1 : -1;
        return left.name.localeCompare(right.name);
      });
      node.children.forEach(sortTree);
    };

    sortTree(tree);

    return NextResponse.json(
      { tree },
      {
        headers: {
          "Cache-Control": "s-maxage=60",
        },
      }
    );
  } catch (error) {
    console.error("[tools/docs/tree] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
