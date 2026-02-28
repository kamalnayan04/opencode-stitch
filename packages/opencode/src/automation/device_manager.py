def execute_shell_command(
        self,
        device_id: str,
        command: str,
        timeout: int = 30,
        check_return_code: bool = False
    ) -> str:
        """
        Execute a shell command on the device.
        
        Args:
            device_id: Device serial number
            command: Shell command to execute
            timeout: Command timeout in seconds
            check_return_code: Whether to check command return code
            
        Returns:
            Command output as string
            
        Raises:
            DeviceError: If command execution fails
        """
        try:
            device = self.get_device(device_id)
            
            # Execute command with increased read timeout for large outputs
            # Use read_until_close to ensure we get all output
            result = device.shell(command, timeout=timeout, read_timeout=timeout)
            
            # Handle both string and bytes output
            if isinstance(result, bytes):
                output = result.decode('utf-8', errors='replace')
            else:
                output = str(result)
            
            # Check return code if requested
            if check_return_code and device.shell(f"echo $?").strip() != "0":
                raise DeviceError(f"Command failed on {device_id}: {command}")
            
            return output
            
        except Exception as e:
            self.logger.error(f"Failed to execute command on {device_id}: {command}")
            raise DeviceError(f"Command execution failed: {e}")