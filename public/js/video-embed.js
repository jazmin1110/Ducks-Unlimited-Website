// =============================================================================
// Ducks Unlimited — Click-to-play YouTube videos (the "Video" section)
// =============================================================================
// The Video section shows a cover picture with a play button that links to
// the video on YouTube (that's what happens without JavaScript). With this
// file, pressing it swaps the picture for the YouTube player right there.
//
// Why not load the player straight away? The YouTube player is heavy: it
// would slow the homepage down for everyone, including people who never
// press play. We also use youtube-nocookie.com, YouTube's privacy-friendlier
// address, which doesn't set tracking cookies until the video is played.
// =============================================================================

document.addEventListener('click', (e) => {
  const link = e.target.closest('.video-embed[data-video-id]');
  if (!link) return;
  // Something already handled this click (e.g. the admin editor's preview,
  // where clicks select sections instead of playing videos).
  if (e.defaultPrevented) return;

  const id = link.dataset.videoId;
  // Only a real 11-character YouTube id gets through.
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
  e.preventDefault();

  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  iframe.title = link.getAttribute('aria-label') || 'Video';
  iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
  iframe.allowFullscreen = true;
  iframe.className = 'video-embed__player';

  const wrapper = document.createElement('div');
  wrapper.className = 'video-embed video-embed--playing';
  wrapper.appendChild(iframe);
  link.replaceWith(wrapper);
});
