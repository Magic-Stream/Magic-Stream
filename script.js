// Add this code to your script section

// Initialize IndexedDB
let db;
const dbName = "MagicVideoDB";
const dbVersion = 1;

// Open database connection when page loads
document.addEventListener('DOMContentLoaded', initDatabase);

function initDatabase() {
    const request = indexedDB.open(dbName, dbVersion);
    
    request.onerror = function(event) {
        console.error("Database error: " + event.target.errorCode);
        showToast("Error opening video storage database");
    };
    
    request.onsuccess = function(event) {
        db = event.target.result;
        console.log("Database opened successfully");
        loadVideos(); // Load saved videos when page loads
    };
    
    request.onupgradeneeded = function(event) {
        const db = event.target.result;
        
        // Create object store for videos
        const videoStore = db.createObjectStore("videos", { keyPath: "id", autoIncrement: true });
        
        // Create indexes for searching
        videoStore.createIndex("caption", "caption", { unique: false });
        
        console.log("Database setup complete");
    };
}

// Updated postVideo function to store in IndexedDB
function postVideo() {
    const videoFile = document.getElementById('videoFile').files[0];
    const miniatureFile = document.getElementById('miniatureFile').files[0];
    const caption = document.getElementById('captionInputPost').value;

    if (!videoFile || !miniatureFile || !caption) {
        showToast('Please fill out all fields');
        return;
    }
    
    // Read files as ArrayBuffers for storage
    const videoReader = new FileReader();
    videoReader.onload = function(event) {
        const videoBuffer = event.target.result;
        
        // Now read the miniature file
        const miniatureReader = new FileReader();
        miniatureReader.onload = function(event) {
            const miniatureBuffer = event.target.result;
            
            // Store everything in IndexedDB
            storeVideo(videoBuffer, miniatureBuffer, caption, videoFile.type, miniatureFile.type);
        };
        
        miniatureReader.readAsArrayBuffer(miniatureFile);
    };
    
    videoReader.readAsArrayBuffer(videoFile);
}

// Store video data in IndexedDB
function storeVideo(videoBuffer, miniatureBuffer, caption, videoType, miniatureType) {
    if (!db) {
        showToast("Database not available");
        return;
    }
    
    // Create a transaction
    const transaction = db.transaction(["videos"], "readwrite");
    
    transaction.oncomplete = function() {
        console.log("Transaction completed: video saved to database");
        showToast('Video posted successfully!');
        
        // Clear the form
        document.getElementById('videoFile').value = '';
        document.getElementById('miniatureFile').value = '';
        document.getElementById('captionInputPost').value = '';
        
        // Reload videos from database
        loadVideos();
        
        navigateTo('home');
    };
    
    transaction.onerror = function(event) {
        console.error("Transaction error: ", event.target.error);
        showToast("Error saving video");
    };
    
    // Get the object store
    const videoStore = transaction.objectStore("videos");
    
    // Create video object to store
    const videoObject = {
        caption: caption,
        videoData: videoBuffer,
        videoType: videoType,
        miniatureData: miniatureBuffer,
        miniatureType: miniatureType,
        timestamp: new Date().getTime(),
        author: "You" // In a real app, this would be the user's name/ID
    };
    
    // Add to database
    const request = videoStore.add(videoObject);
    
    request.onsuccess = function() {
        console.log("Video added to the database successfully");
    };
}

// Load videos from IndexedDB
function loadVideos() {
    if (!db) {
        console.log("Database not ready yet");
        return;
    }
    
    // Clear the current list
    const videoList = document.getElementById('videoList');
    videoList.innerHTML = '';
    
    const transaction = db.transaction(["videos"], "readonly");
    const videoStore = transaction.objectStore("videos");
    const request = videoStore.getAll();
    
    request.onsuccess = function(event) {
        const videos = event.target.result;
        
        if (videos.length === 0) {
            // Show empty state if no videos
            const emptyState = document.createElement('div');
            emptyState.classList.add('empty-state');
            emptyState.innerHTML = '<p>No videos posted yet. Go to Settings to post your first video!</p>';
            videoList.appendChild(emptyState);
            return;
        }
        
        // Sort videos by timestamp (newest first)
        videos.sort((a, b) => b.timestamp - a.timestamp);
        
        // Add each video to the list
        videos.forEach(video => {
            addVideoToList(video);
        });
    };
    
    request.onerror = function(event) {
        console.error("Error loading videos: ", event.target.error);
        showToast("Error loading videos");
    };
}

// Add a video item to the video list
function addVideoToList(video) {
    // Convert binary data back to Blob objects
    const videoBlob = new Blob([video.videoData], { type: video.videoType });
    const miniatureBlob = new Blob([video.miniatureData], { type: video.miniatureType });
    
    // Create URLs from blobs
    const videoURL = URL.createObjectURL(videoBlob);
    const miniatureURL = URL.createObjectURL(miniatureBlob);
    
    // Create video item element
    const videoItem = document.createElement('div');
    videoItem.classList.add('video-item');
    videoItem.dataset.id = video.id; // Store the database ID for later use
    
    // Make the video item clickable to play
    videoItem.onclick = function() {
        playVideo(video.caption, video.caption, videoURL);
    };

    videoItem.innerHTML = `
        <img src="${miniatureURL}" alt="Video Thumbnail">
        <div>
            <h3>${video.caption}</h3>
            <p>Posted by ${video.author}</p>
        </div>
    `;
    
    document.getElementById('videoList').appendChild(videoItem);
}

// Updated deleteVideo function to remove from IndexedDB
function deleteVideo() {
    if (!db) {
        showToast("Database not available");
        return;
    }
    
    const transaction = db.transaction(["videos"], "readwrite");
    const videoStore = transaction.objectStore("videos");
    
    // Get all videos
    const request = videoStore.getAll();
    
    request.onsuccess = function(event) {
        const videos = event.target.result;
        
        // Filter to only user's videos (where author is "You")
        const userVideos = videos.filter(video => video.author === "You");
        
        if (userVideos.length === 0) {
            showToast("No videos to delete");
            return;
        }
        
        // Get the most recent video (last one in the sorted array)
        const videoToDelete = userVideos[userVideos.length - 1];
        
        // Delete it from the database
        const deleteRequest = videoStore.delete(videoToDelete.id);
        
        deleteRequest.onsuccess = function() {
            showToast("Video deleted successfully!");
            loadVideos(); // Reload the video list
        };
        
        deleteRequest.onerror = function(event) {
            console.error("Error deleting video: ", event.target.error);
            showToast("Error deleting video");
        };
    };
}

// Updated searchVideos function to work with IndexedDB
function searchVideos(event) {
    const searchTerm = event.target.value.toLowerCase();
    
    if (!db) {
        console.log("Database not ready yet");
        return;
    }
    
    // Clear current list
    const videoList = document.getElementById('videoList');
    const noResultsMsg = document.getElementById('noResultsMsg');
    if (noResultsMsg) noResultsMsg.remove();
    
    // Get all videos
    const transaction = db.transaction(["videos"], "readonly");
    const videoStore = transaction.objectStore("videos");
    const request = videoStore.getAll();
    
    request.onsuccess = function(event) {
        const videos = event.target.result;
        
        // Clear the current list
        videoList.innerHTML = '';
        
        if (videos.length === 0) {
            // Show empty state if no videos
            const emptyState = document.createElement('div');
            emptyState.classList.add('empty-state');
            emptyState.innerHTML = '<p>No videos posted yet. Go to Settings to post your first video!</p>';
            videoList.appendChild(emptyState);
            return;
        }
        
        // Sort videos by timestamp (newest first)
        videos.sort((a, b) => b.timestamp - a.timestamp);
        
        // Filter by search term if provided
        let filteredVideos = videos;
        if (searchTerm) {
            filteredVideos = videos.filter(video => 
                video.caption.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filteredVideos.length === 0) {
            const msg = document.createElement('p');
            msg.id = 'noResultsMsg';
            msg.textContent = 'No videos match your search';
            videoList.appendChild(msg);
            return;
        }
        
        // Add filtered videos to the list
        filteredVideos.forEach(video => {
            addVideoToList(video);
        });
    };
}

// Updated playVideo function
function playVideo(title, caption, videoUrl) {
    currentVideo = {
        title: title,
        caption: caption,
        url: videoUrl
    };
    
    document.getElementById('videoPlayerTitle').textContent = title;
    document.getElementById('videoPlayerCaption').textContent = caption;
    
    const videoPlayer = document.getElementById('videoPlayer');
    videoPlayer.src = videoUrl;
    
    navigateTo('videoPlayer');
    
    // Start loading animation
    document.querySelector('.progress-bar').classList.remove('hidden');
    
    // Hide loading animation when video is loaded
    videoPlayer.onloadeddata = function() {
        document.querySelector('.progress-bar').classList.add('hidden');
        videoPlayer.play();
    };
}
