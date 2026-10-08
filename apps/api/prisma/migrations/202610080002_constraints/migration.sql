ALTER TABLE "File" ADD CONSTRAINT "File_size_bounds" CHECK ("size" > 0 AND "size" <= 10485760);
ALTER TABLE "Share" ADD CONSTRAINT "Share_download_bounds" CHECK ("maxDownloads" BETWEEN 1 AND 100 AND "downloads" BETWEEN 0 AND "maxDownloads");
