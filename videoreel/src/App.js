import { useEffect, useState, useCallback, useRef } from 'react';
import jsonp from 'jsonp';
import './App.css';

async function extractMp4StreamFromLink(url) {
  if (/^https?:\/\/i\.imgur\.com\/[^.]+\.gifv\/?$/.exec(url)) {
    return url.replace('gifv', 'mp4');
  }
  return null;
}

function transformRedditVideoUrlToAudio(url) {
  return `https://v.redd.it/${
    url.match(/redd\.it\/([^/]+)/)[1]
  }/DASH_audio.mp4`;
}

async function extractMediaFromPost(post) {
  let videoUrl = await extractMp4StreamFromLink(post.url);
  let audioUrl = null;

  if (videoUrl === null) {
    if (post.media != null && post.media.reddit_video != null) {
      videoUrl = post.media.reddit_video.fallback_url;
      audioUrl = transformRedditVideoUrlToAudio(
        post.media.reddit_video.fallback_url
      );
    } else if (
      post.secure_media != null &&
      post.secure_media.reddit_video != null
    ) {
      videoUrl = post.secure_media.reddit_video.fallback_url;
      audioUrl = transformRedditVideoUrlToAudio(
        post.secure_media.reddit_video.fallback_url
      );
    } else if (
      post.preview != null &&
      post.preview.reddit_video_preview != null
    ) {
      videoUrl = post.preview.reddit_video_preview.fallback_url;
      audioUrl = transformRedditVideoUrlToAudio(
        post.preview.reddit_video_preview.fallback_url
      );
    } else {
      console.log(`Unhandled reddit post: ${post.permalink}`);
    }
  }
  return { videoUrl: videoUrl, audioUrl: audioUrl };
}

const VideoInformation = ({ video, videoNumber, totalVideos }) => {
  if (video === undefined) {
    return <div id="info">Fetching the next set of videos...</div>;
  }

  return (
    <div id="info">
      <p>
        Video {videoNumber}/{totalVideos}:{' '}
        <a href={`https://www.reddit.com${video.post.permalink}`}>
          {video.post.title}
        </a>
      </p>
    </div>
  );
};

const VideoReel = ({ subreddit, sort, timeSpan }) => {
  const [pagingAfter, setPagingAfter] = useState('');
  const [videoList, setVideoList] = useState([]);
  const [videoIndex, setVideoIndex] = useState(0);
  const isLoadingVideos = useRef(false);
  const cancelVideoLoadRequestCallback = useRef(() => {});

  const [autoNext, setAutoNext] = useState(true);
  const [muted, setMuted] = useState(true);

  const createdArrowKeyHandler = useRef(false);
  const [previousSubreddit, setPreviousSubreddit] = useState(subreddit);
  const [previousSort, setPreviousSort] = useState(sort);
  const [previousTimeSpan, setPreviousTimeSpan] = useState(timeSpan);

  const reset = useCallback(() => {
    setPagingAfter('');
    setVideoList([]);
    setVideoIndex(0);
    cancelVideoLoadRequestCallback.current();
    isLoadingVideos.current = false;
  }, []);

  useEffect(() => {
    if (
      subreddit !== previousSubreddit ||
      sort !== previousSort ||
      timeSpan !== previousTimeSpan
    ) {
      reset();
      setPreviousSubreddit(subreddit);
      setPreviousSort(sort);
      setPreviousTimeSpan(timeSpan);
    }
  }, [
    subreddit,
    previousSubreddit,
    sort,
    previousSort,
    timeSpan,
    previousTimeSpan,
    reset,
  ]);

  const nextVideo = useCallback(() => {
    setVideoIndex((previous) => previous + 1);
  }, []);

  const previousVideo = useCallback(() => {
    setVideoIndex((previous) => Math.max(previous - 1, 0));
  }, []);

  useEffect(() => {
    if (!createdArrowKeyHandler.current) {
      window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowRight') {
          nextVideo();
        } else if (e.key === 'ArrowLeft') {
          previousVideo();
        }
      });
      createdArrowKeyHandler.current = true;
    }
  }, [nextVideo, previousVideo]);

  const fetchNextSetOfVideos = useCallback(() => {
    if (isLoadingVideos.current) {
      return;
    }
    isLoadingVideos.current = true;
    cancelVideoLoadRequestCallback.current = jsonp(
      `https://www.reddit.com/r/${subreddit}/${sort}.json?after=${pagingAfter}&t=${timeSpan}`,
      { param: 'jsonp', timeout: 5000 },
      async (err, data) => {
        if (err) {
          isLoadingVideos.current = false;
          console.error(err);
          return;
        }
        const posts = data.data.children.map((x) => x.data);
        const newVideos = [];

        for (const post of posts) {
          let { videoUrl, audioUrl } = await extractMediaFromPost(post);
          if (videoUrl) {
            newVideos.push({ url: videoUrl, audioUrl: audioUrl, post: post });
          }
        }

        setPagingAfter(data.data.after);
        setVideoList((previous) => [...previous, ...newVideos]);
        isLoadingVideos.current = false;
      }
    );
  }, [subreddit, sort, pagingAfter, timeSpan]);

  useEffect(() => {
    if (videoIndex + 1 >= videoList.length) {
      fetchNextSetOfVideos();
    }
  }, [videoIndex, videoList, fetchNextSetOfVideos]);

  return (
    <div id="videoReel">
      <div id="videoContainer">
        {videoList[videoIndex] !== undefined ? (
          <video
            key={videoIndex}
            autoPlay
            muted={muted}
            loop={!autoNext}
            onEnded={() => {
              if (autoNext) {
                nextVideo();
              }
            }}
            onError={(e) => {
              if (e.target.id !== 'audioSource' && autoNext) {
                nextVideo();
              }
            }}
          >
            <source src={videoList[videoIndex].url} />
            {videoList[videoIndex].audioUrl != null ? (
              <audio autoPlay muted={muted} loop={!autoNext}>
                <source id="audioSource" src={videoList[videoIndex].audioUrl} />
              </audio>
            ) : null}
          </video>
        ) : null}
      </div>
      <div id="controls">
        <button onClick={previousVideo} disabled={videoIndex <= 0}>
          Previous
        </button>
        <button onClick={nextVideo}>Next</button>
        <div id="settings">
          <input
            id="checkAutoNext"
            type="checkbox"
            defaultChecked={autoNext}
            onChange={(e) => setAutoNext(e.target.checked)}
          ></input>
          <label htmlFor="checkAutoNext">Auto-next</label>
          <input
            id="checkMute"
            type="checkbox"
            defaultChecked={muted}
            onChange={(e) => setMuted(e.target.checked)}
          ></input>
          <label htmlFor="checkMute">Muted</label>
        </div>
        <VideoInformation
          video={videoList[videoIndex]}
          videoNumber={videoIndex + 1}
          totalVideos={videoList.length}
        />
      </div>
    </div>
  );
};

const App = () => {
  const [subreddit, setSubreddit] = useState('oddlysatisfying');
  const [sort, setSort] = useState('hot');
  const [timeSpan, setTimeSpan] = useState('');

  return (
    <div>
      <div className="fullscreenContainer">
        <VideoReel subreddit={subreddit} sort={sort} timeSpan={timeSpan} />
      </div>
      <div id="subredditSelector">
        <input
          placeholder="Subreddit"
          defaultValue={subreddit}
          onBlur={(e) => {
            setSubreddit(e.target.value);
          }}
        ></input>
        <select
          defaultValue={sort}
          onChange={(e) => setSort(e.target.value)}
          onKeyDown={(e) => e.preventDefault()}
        >
          <option value="hot">Hot</option>
          <option value="new">New</option>
          <option value="top">Top</option>
        </select>
        {sort === 'top' ? (
          <select
            defaultValue={timeSpan}
            onChange={(e) => setTimeSpan(e.target.value)}
            onKeyDown={(e) => e.preventDefault()}
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="year">This Year</option>
            <option value="all">Of All Time</option>
          </select>
        ) : null}
      </div>
    </div>
  );
};

export default App;
