def _get_current_activity_from_activities(self, device_id: str, package_name: Optional[str] = None) -> Optional[str]:
        """
        Get current activity from activities dump.
        
        Args:
            device_id: Device identifier
            package_name: Optional package name to filter activities
        """
        try:
            self.logger.info("Falling back to activity dump")
            
            if package_name:
                # Get activities for specific package with increased buffer
                cmd = f"dumpsys activity activities | grep -A 20 '{package_name}' | head -50"
                result = self.device_manager.execute_shell_command(device_id, cmd)
                
                if result and result.strip():
                    activity = self._parse_activity_from_activities_dump(result)
                    if activity:
                        return activity
                
                self.logger.warning("Specific grep failed, getting full activity dump")
            
            # Get top activity from full dump (but limit output to avoid truncation)
            # Focus on the topResumedActivity line and recent history
            result = self.device_manager.execute_shell_command(
                device_id,
                "dumpsys activity activities | grep -E 'topResumedActivity|Hist.*#0' | head -10"
            )
            
            if result and result.strip():
                activity = self._parse_activity_from_activities_dump(result)
                if activity:
                    return activity
            
            # Final fallback: get just the top task info
            result = self.device_manager.execute_shell_command(
                device_id,
                "dumpsys activity activities | head -30"
            )
            
            if not result or not result.strip():
                self.logger.warning("Empty activities dump output received")
                return None
            
            activity = self._parse_activity_from_activities_dump(result)
            if not activity:
                self.logger.warning("No activity patterns matched in activities dump")
                # Log a sample of the output for debugging
                sample = result[:500] if len(result) > 500 else result
                self.logger.debug(f"Activities dump sample: {sample}")
            
            return activity
            
        except Exception as e:
            self.logger.error(f"Error getting activity from activities dump: {e}")
            return None