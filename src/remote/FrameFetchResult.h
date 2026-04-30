#ifndef REMOTE_FRAME_FETCH_RESULT_H
#define REMOTE_FRAME_FETCH_RESULT_H

namespace remote
{

enum class FrameFetchResult
{
  Updated,
  NotModified,
  Failed,
};

} // namespace remote

#endif // REMOTE_FRAME_FETCH_RESULT_H
