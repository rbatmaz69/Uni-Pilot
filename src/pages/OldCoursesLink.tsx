import { Navigate, useSearchParams } from 'react-router-dom';
import { iliasSpaceLink } from '@/features/courses';

/** A link to the former Courses page, sent on to the same place in the ILIAS space. */
export function OldCoursesLink() {
  const [params] = useSearchParams();
  const trail = (params.get('trail') ?? '').split(',').filter(Boolean);
  return (
    <Navigate to={iliasSpaceLink(params.get('course'), trail, params.get('exercise'))} replace />
  );
}
