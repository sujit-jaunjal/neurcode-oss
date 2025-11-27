/**
 * Unit Tests for Diff Parser
 * 
 * Tests edge cases, malformed inputs, and various diff formats.
 */

import { describe, it, expect } from 'vitest';
import { parseDiff, getDiffSummary, type DiffFile } from './index';

describe('parseDiff', () => {
  describe('basic functionality', () => {
    it('should parse a simple file addition', () => {
      const diff = `diff --git a/newfile.js b/newfile.js
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/newfile.js
@@ -0,0 +1,3 @@
+console.log('hello');
+const x = 1;
+const y = 2;
`;

      const result = parseDiff(diff);
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('newfile.js');
      expect(result[0].changeType).toBe('add');
      expect(result[0].addedLines).toBe(3);
      expect(result[0].removedLines).toBe(0);
    });

    it('should parse a file deletion', () => {
      const diff = `diff --git a/oldfile.js b/oldfile.js
deleted file mode 100644
index abc1234..0000000
--- a/oldfile.js
+++ /dev/null
@@ -1,3 +0,0 @@
-console.log('hello');
-const x = 1;
-const y = 2;
`;

      const result = parseDiff(diff);
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('oldfile.js');
      expect(result[0].changeType).toBe('delete');
      expect(result[0].addedLines).toBe(0);
      expect(result[0].removedLines).toBe(3);
    });

    it('should parse a file modification', () => {
      const diff = `diff --git a/file.js b/file.js
index abc1234..def5678 100644
--- a/file.js
+++ b/file.js
@@ -1,3 +1,4 @@
 console.log('hello');
 const x = 1;
+const y = 2;
 const z = 3;
`;

      const result = parseDiff(diff);
      
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('file.js');
      expect(result[0].changeType).toBe('modify');
      expect(result[0].addedLines).toBe(1);
      expect(result[0].removedLines).toBe(0);
    });

    it('should parse multiple files', () => {
      const diff = `diff --git a/file1.js b/file1.js
index abc1234..def5678 100644
--- a/file1.js
+++ b/file1.js
@@ -1 +1,2 @@
 console.log('hello');
+console.log('world');

diff --git a/file2.js b/file2.js
index 1111111..2222222 100644
--- a/file2.js
+++ b/file2.js
@@ -1 +1,2 @@
 const x = 1;
+const y = 2;
`;

      const result = parseDiff(diff);
      
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('file1.js');
      expect(result[1].path).toBe('file2.js');
    });
  });

  describe('edge cases', () => {
    it('should handle empty diff', () => {
      const result = parseDiff('');
      expect(result).toHaveLength(0);
    });

    it('should handle whitespace-only diff', () => {
      const result = parseDiff('   \n  \n  ');
      expect(result).toHaveLength(0);
    });

    it('should handle diff with no changes', () => {
      const diff = `diff --git a/file.js b/file.js
index abc1234..abc1234 100644
--- a/file.js
+++ b/file.js
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].addedLines).toBe(0);
      expect(result[0].removedLines).toBe(0);
    });

    it('should handle very large diff', () => {
      const lines = Array(10000).fill(0).map((_, i) => `+line ${i}`);
      const diff = `diff --git a/large.js b/large.js
new file mode 100644
--- /dev/null
+++ b/large.js
@@ -0,0 +1,10000 @@
${lines.join('\n')}
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].addedLines).toBe(10000);
    });

    it('should handle binary files', () => {
      const diff = `diff --git a/image.png b/image.png
index abc1234..def5678 100644
Binary files a/image.png and b/image.png differ
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('image.png');
      // Binary files typically have 0 added/removed
    });

    it('should handle file renames', () => {
      const diff = `diff --git a/oldname.js b/newname.js
similarity index 100%
rename from oldname.js
rename to newname.js
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('newname.js');
      expect(result[0].changeType).toBe('rename');
    });

    it('should handle malformed hunk headers', () => {
      const diff = `diff --git a/file.js b/file.js
--- a/file.js
+++ b/file.js
@@ invalid hunk header @@
+some line
`;

      // Should not crash, but may not parse correctly
      const result = parseDiff(diff);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle special characters in file paths', () => {
      const diff = `diff --git a/file with spaces.js b/file with spaces.js
index abc1234..def5678
--- a/file with spaces.js
+++ b/file with spaces.js
@@ -1 +1,2 @@
 console.log('hello');
+console.log('world');
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('file with spaces.js');
    });

    it('should handle unicode in file paths', () => {
      const diff = `diff --git a/文件.js b/文件.js
index abc1234..def5678
--- a/文件.js
+++ b/文件.js
@@ -1 +1,2 @@
 console.log('hello');
+console.log('world');
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('文件.js');
    });
  });

  describe('fuzz tests', () => {
    it('should handle random strings', () => {
      const randomString = Math.random().toString(36).repeat(100);
      const result = parseDiff(randomString);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extremely long lines', () => {
      const longLine = 'a'.repeat(100000);
      const diff = `diff --git a/file.js b/file.js
--- a/file.js
+++ b/file.js
@@ -1 +1,2 @@
+${longLine}
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
    });

    it('should handle many hunks in one file', () => {
      const hunks = Array(100).fill(0).map((_, i) => 
        `@@ -${i * 10},1 +${i * 10},2 @@\n-line ${i}\n+line ${i}\n+new line ${i}`
      ).join('\n');
      
      const diff = `diff --git a/file.js b/file.js
--- a/file.js
+++ b/file.js
${hunks}
`;

      const result = parseDiff(diff);
      expect(result).toHaveLength(1);
      expect(result[0].addedLines).toBeGreaterThan(0);
    });
  });
});

describe('getDiffSummary', () => {
  it('should calculate correct summary', () => {
    const diff = `diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -1 +1,2 @@
 console.log('hello');
+console.log('world');

diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,1 @@
 console.log('hello');
-console.log('old');
`;

    const files = parseDiff(diff);
    const summary = getDiffSummary(files);

    expect(summary.totalFiles).toBe(2);
    expect(summary.totalAdded).toBe(1);
    expect(summary.totalRemoved).toBe(1);
    expect(summary.files).toHaveLength(2);
  });

  it('should handle empty diff summary', () => {
    const summary = getDiffSummary([]);
    
    expect(summary.totalFiles).toBe(0);
    expect(summary.totalAdded).toBe(0);
    expect(summary.totalRemoved).toBe(0);
    expect(summary.files).toHaveLength(0);
  });

  it('should handle large diff summary', () => {
    const files: DiffFile[] = Array(1000).fill(0).map((_, i) => ({
      path: `file${i}.js`,
      changeType: 'modify' as const,
      addedLines: 10,
      removedLines: 5,
      hunks: [],
    }));

    const summary = getDiffSummary(files);

    expect(summary.totalFiles).toBe(1000);
    expect(summary.totalAdded).toBe(10000);
    expect(summary.totalRemoved).toBe(5000);
    expect(summary.files[0]).toHaveProperty('added', 10);
    expect(summary.files[0]).toHaveProperty('removed', 5);
  });
});

