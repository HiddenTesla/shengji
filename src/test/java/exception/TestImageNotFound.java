package exception;

import gui.ImageContainer;
import org.testng.Assert;
import org.testng.annotations.Test;

public class TestImageNotFound {

    private static final String IMAGE_DIRECTORY = ImageContainer.IMAGE_DIRECTORY;

    @Test
    public void TestImageFound() {
        ImageContainer image = new ImageContainer("sample.jpg");
    }

    @Test
    public void TestImageNotFound_() {
        try {
            ImageContainer image = new ImageContainer("not_such_file");
            Assert.fail();
        }
        catch (ImageNotFoundException e) {

        }
    }
}
