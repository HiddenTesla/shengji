# Misc
- This file iteself is not to be committed so far.

# Chat
- Follow the language of prompt.

# Code style:
- Always use LF for line ending, no CRLF.
- When new files created, not only should them use LF (NO CRLF) in disk, but use LF in memory as well.
- When new files created, execute a `git add` commond, but do not commit or push.
- All text files must end with a LF, to avoid git "No new line" .
- Use 2-space for indent.
- Add a trailing comma for multi-line, as long as the syntax allows.
  E.g.
  ```python
  arrs = [
    1,
    2,
    3, -- there is a trailing comma here
  ]
  ```
  ```java
  enum Foo {
    foo0,
    foo1,
    foo2,   
  }
  ```
  