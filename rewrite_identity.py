def callback(commit, metadata):
    if commit.author_email == b"antigravity@google.com":
        commit.author_name = b"dev-ayush-17"
        commit.author_email = b"lbyarinth1@gmail.com"

    if commit.committer_email == b"antigravity@google.com":
        commit.committer_name = b"dev-ayush-17"
        commit.committer_email = b"lbyarinth1@gmail.com"
