export function sameNativeMemberFileIdentity(left, right) {
  return left?.dev === right?.dev && left?.ino === right?.ino && left?.mode === right?.mode
    && left?.size === right?.size && left?.birthtimeNs === right?.birthtimeNs;
}
