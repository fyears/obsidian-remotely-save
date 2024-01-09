# Backblaze B2

## Links

https://www.backblaze.com/cloud-storage

## Steps

1. Create a Backblaze account [on this page](https://www.backblaze.com/cloud-storage). Credit card info *is not* required. Backblaze B2 offers 10 GB of free storage.
2. Create a **bucket**, you can leave the default settings:
   ![](./s3_backblaze_b2-1-bucket.png)
   ![](./s3_backblaze_b2-2-create_bucket.png)
4. Copy `Endpoint`, eg. `s3.us-east-005.backblazeb2.com` — it'll be used later.
5. Copy `bucketname` near the 🪣 icon — it'll be used later.
   ![](./s3_backblaze_b2-3-copy.png)
6. Go to **Application Keys**:

     ![](./s3_backblaze_b2-4-app_keys.png)

8. **Add a new key**: 
   ![](./s3_backblaze_b2-5-add_new_app_keys.png)
   ![](./s3_backblaze_b2-6-app_keys_copy.png)
9. Save `keyID` and `applicationKey` — they will be used later.
10. Go to Remotely Save settings in Obsidian and: 
	- Choose `S3 or compatibile` in **Remote Service**:
	- Copy `Endpoint` from Backblaze (see 3. above) to `Endpoint` in Remotely Save
	- From `endpoint` take `region` (eg. `us-east-005`) and paste it in `endpoint` in Remotely Save
	- Copy `keyID` (see 7. above) to `Access Key ID` in Remotely Save
	- Copy `applicationKey` (see 7. above) to `Secret Access Key` in Remotely Save
	- Copy `bucketname` (see 4. above) to `Bucket Name` in Remotely Save
	  ![](./s3_backblaze_b2-7-copy_paste.png)

11. **Enable CORS**:
   ![](./s3_backblaze_b2-8-cors.png)

12. Click **Check** in _Check Connectivity_ to see if you can connect to B2 bucket:
	![](./s3_backblaze_b2-9-check_connectionpng.png)

13. Sync!

  ![](./s3_backblaze_b2-10-sync.png)
